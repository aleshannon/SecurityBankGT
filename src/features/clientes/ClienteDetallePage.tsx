import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDate, formatMoney } from '@/domain/format'
import { CLIENTE_ESTADO, CUENTA_TIPO, KYC_LABEL, TARJETA_ESTADO, toneFor } from '@/domain/labels'
import { Badge, EmptyState, PageHeader, Panel, SkeletonRows } from '@/components/ui'

export function ClienteDetallePage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['cliente', id], queryFn: () => api.getCliente(id), enabled: Boolean(id) })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError || !query.data) return <EmptyState title="No se puede mostrar el cliente" body={errorText(query.error)} />
  const { cliente, cuentas, tarjetas } = query.data
  return (
    <div>
      <PageHeader title={`${cliente.nombres} ${cliente.apellidos}`} description={`${cliente.codigo} · alta ${formatDate(cliente.fechaAlta)}`} actions={<Link className="text-sm text-accentink" to="/clientes">Volver</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={toneFor(cliente.estado)}>{CLIENTE_ESTADO[cliente.estado]}</Badge>
        <Badge tone={toneFor(cliente.estadoKyc)}>{KYC_LABEL[cliente.estadoKyc]}</Badge>
        <Badge tone={toneFor(cliente.nivelRiesgo)}>{cliente.nivelRiesgo}</Badge>
      </div>
      <Panel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">DPI</dt><dd className="font-mono">{cliente.dpi}</dd></div>
          <div><dt className="text-muted">NIT</dt><dd>{cliente.nit}</dd></div>
          <div><dt className="text-muted">Correo</dt><dd>{cliente.correo}</dd></div>
          <div><dt className="text-muted">Teléfono</dt><dd>{cliente.telefono}</dd></div>
          <div><dt className="text-muted">Nacimiento</dt><dd>{formatDate(cliente.fechaNacimiento)}</dd></div>
          <div><dt className="text-muted">Dirección</dt><dd>{cliente.direccion}</dd></div>
        </dl>
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-semibold">Cuentas</h2>
          {cuentas.map((cuenta) => (
            <div key={cuenta.id} className="mb-2 flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm">
              <div><p className="font-medium">{cuenta.numero}</p><p className="text-muted">{CUENTA_TIPO[cuenta.tipo]}</p></div>
              <p>{formatMoney(cuenta.saldo)}</p>
            </div>
          ))}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">Tarjetas</h2>
          {tarjetas.length === 0 ? <p className="text-sm text-muted">Sin tarjetas.</p> : tarjetas.map((tarjeta) => (
            <div key={tarjeta.id} className="mb-2 flex items-center justify-between text-sm">
              <span>{tarjeta.marca} ···· {tarjeta.ultimos4}</span>
              <Badge tone={toneFor(tarjeta.estado)}>{TARJETA_ESTADO[tarjeta.estado]}</Badge>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}
