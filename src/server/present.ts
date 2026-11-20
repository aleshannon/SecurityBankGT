import { maskDpi, maskPhone } from '@/domain/format'
import type { Cliente, Cuenta, CuentaVista, Database, Transaccion, TransaccionVista } from '@/domain/types'
import type { Ctx } from './store'
import { puedeRevelar } from './store'

export function presentarCliente(ctx: Ctx, cliente: Cliente): Cliente {
  const copy = structuredClone(cliente)
  if (puedeRevelar(ctx)) return copy
  return { ...copy, dpi: maskDpi(copy.dpi), telefono: maskPhone(copy.telefono) }
}

export function presentarCuenta(db: Database, cuenta: Cuenta): CuentaVista {
  const cliente = db.clientes.find((item) => item.id === cuenta.clienteId)
  return {
    ...structuredClone(cuenta),
    clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : '—',
    clienteCodigo: cliente?.codigo ?? '—',
  }
}

export function presentarTx(db: Database, tx: Transaccion): TransaccionVista {
  const origen = db.cuentas.find((item) => item.id === tx.cuentaOrigenId)
  const destino = db.cuentas.find((item) => item.id === tx.cuentaDestinoId)
  const clienteId = origen?.clienteId ?? destino?.clienteId
  const cliente = db.clientes.find((item) => item.id === clienteId)
  return {
    ...structuredClone(tx),
    origenNumero: origen?.numero ?? null,
    destinoNumero: destino?.numero ?? null,
    clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : '—',
  }
}
