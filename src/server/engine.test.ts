import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '@/domain/errors'
import { maskDpi } from '@/domain/format'
import { demo } from './demoApi'
import { getDb, resetDb } from './store'

const device = 'Vitest / Node'

async function entrar(email: string, password: string) {
  const pending = await demo.signIn({ email, password, simulateForeign: false, device })
  await demo.verifyOtp(pending.demoCode)
}

describe('motor de SecurityBankGT', () => {
  beforeEach(() => {
    resetDb()
  })

  it('exige OTP y no guarda el rol en la sesión del navegador', async () => {
    const pending = await demo.signIn({ email: 'cliente@securitybankgt.com', password: 'Cliente#2026Gt!', simulateForeign: false, device })
    expect(pending.demoCode).toMatch(/^\d{6}$/)
    const before = await demo.session()
    expect(before.status).toBe('mfa')
    expect(before.role).toBeUndefined()
    const ready = await demo.verifyOtp(pending.demoCode)
    expect(ready.role).toBe('cliente')
    expect(getDb().userRoles.find((row) => row.userId === ready.userId)?.role).toBe('cliente')
  })

  it('bloquea la cuenta al quinto intento fallido y lo audita', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(demo.signIn({ email: 'cliente@securitybankgt.com', password: 'incorrecta', simulateForeign: false, device })).rejects.toThrow('Credenciales inválidas.')
    }
    await expect(demo.signIn({ email: 'cliente@securitybankgt.com', password: 'incorrecta', simulateForeign: false, device })).rejects.toThrow('bloqueada')
    expect(getDb().auditLogs.filter((log) => log.accion === 'LOGIN' && log.resultado === 'fallo').length).toBeGreaterThanOrEqual(5)
    await expect(demo.signIn({ email: 'cliente@securitybankgt.com', password: 'Cliente#2026Gt!', simulateForeign: false, device })).rejects.toThrow('bloqueada')
  })

  it('impide a un cliente ver a otro y registra el intento', async () => {
    await entrar('cliente@securitybankgt.com', 'Cliente#2026Gt!')
    const propio = await demo.getCliente('cli-0001')
    expect(propio.cliente.dpi).toBe(maskDpi(getDb().clientes[0].dpi))
    await expect(demo.getCliente('cli-0002')).rejects.toBeInstanceOf(AppError)
    expect(getDb().securityEvents.some((event) => event.tipo === 'acceso_no_autorizado')).toBe(true)
  })

  it('transfiere una sola vez ante la misma clave y rechaza saldo insuficiente', async () => {
    await entrar('cliente@securitybankgt.com', 'Cliente#2026Gt!')
    const cuentas = (await demo.listCuentas({ clienteId: 'cli-0001' })).items
    const origen = cuentas[0]
    const destino = cuentas[1]
    const antes = origen.saldo
    const key = 'idem-prueba-0001'
    const primera = await demo.transferir({
      cuentaOrigenId: origen.id,
      destino: 'propia',
      cuentaDestinoId: destino.id,
      monto: 150,
      canal: 'web',
      idempotencyKey: key,
    })
    if (!('referencia' in primera)) throw new Error('Se esperaba una transacción')
    const segunda = await demo.transferir({
      cuentaOrigenId: origen.id,
      destino: 'propia',
      cuentaDestinoId: destino.id,
      monto: 150,
      canal: 'web',
      idempotencyKey: key,
    })
    if (!('referencia' in segunda)) throw new Error('Se esperaba la misma transacción')
    expect(segunda.referencia).toBe(primera.referencia)
    const actual = getDb().cuentas.find((cuenta) => cuenta.id === origen.id)
    expect(actual?.saldo).toBeCloseTo(antes - 150, 2)
    await expect(demo.transferir({
      cuentaOrigenId: origen.id,
      destino: 'propia',
      cuentaDestinoId: destino.id,
      monto: 999999,
      canal: 'web',
      idempotencyKey: 'idem-prueba-0002',
    })).rejects.toThrow('Saldo insuficiente.')
    expect(getDb().cuentas.find((cuenta) => cuenta.id === origen.id)?.saldo).toBeCloseTo(antes - 150, 2)
  })

  it('pide OTP y marca las transferencias mayores a Q10,000', async () => {
    await entrar('admin@securitybankgt.com', 'Admin#2026Gtq!')
    const origen = getDb().cuentas.find((cuenta) => cuenta.id === 'cta-0001')
    const destino = getDb().cuentas.find((cuenta) => cuenta.id === 'cta-0002')
    if (!origen || !destino) throw new Error('Faltan cuentas de prueba')
    const antes = origen.saldo
    const pending = await demo.transferir({
      cuentaOrigenId: origen.id,
      destino: 'propia',
      cuentaDestinoId: destino.id,
      monto: 12000,
      canal: 'web',
      idempotencyKey: 'idem-alta-0001',
    })
    if (!('demoCode' in pending)) throw new Error('Se esperaba OTP')
    expect(getDb().cuentas.find((cuenta) => cuenta.id === origen.id)?.saldo).toBeCloseTo(antes, 2)
    const done = await demo.confirmarTransferencia({ draftId: pending.draftId, code: pending.demoCode })
    expect(done.estado).toBe('marcada')
    expect(getDb().cuentas.find((cuenta) => cuenta.id === origen.id)?.saldo).toBeCloseTo(antes - 12000, 2)
  })

  it('carga el volumen de demostración pedido', () => {
    const db = getDb()
    expect(db.clientes).toHaveLength(25)
    expect(db.cuentas).toHaveLength(40)
    expect(db.tarjetas).toHaveLength(30)
    expect(db.beneficiarios).toHaveLength(15)
    expect(db.transacciones).toHaveLength(300)
    expect(db.transacciones.filter((tx) => tx.estado === 'marcada')).toHaveLength(10)
    expect(db.auditLogs.length).toBeGreaterThanOrEqual(60)
    expect(db.securityEvents.length).toBeGreaterThanOrEqual(30)
    expect(db.incidentes).toHaveLength(5)
    expect(db.activos).toHaveLength(15)
    expect(db.amenazas).toHaveLength(12)
    expect(db.riesgos).toHaveLength(12)
    expect(db.hallazgos).toHaveLength(15)
    expect(db.casos.length).toBeGreaterThanOrEqual(6)
  })

  it('no permite modificar una transacción y aísla al auditor de los depósitos', async () => {
    await entrar('auditor@securitybankgt.com', 'Auditor#2026Gt!')
    const tx = getDb().transacciones[0]
    await expect(demo.intentarModificarTransaccion(tx.id)).rejects.toThrow('inmutables')
    await expect(demo.depositar({ cuentaId: 'cta-0001', monto: 10, canal: 'web', idempotencyKey: 'no-debe' })).rejects.toThrow('permiso')
    await expect(demo.listRiesgos()).resolves.toHaveLength(12)
  })
})
