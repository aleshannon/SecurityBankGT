import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDateTime } from '@/domain/format'
import { INCIDENTE_ESTADO, SEVERIDAD, toneFor } from '@/domain/labels'
import { incidenteSchema, notaSchema } from '@/domain/schemas'
import type { EstadoIncidente, Severidad } from '@/domain/types'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Pagination, Panel, SelectInput, SkeletonRows, TextArea, TextInput, fieldErrors } from '@/components/ui'

const tabs = ['Auditoría', 'Eventos', 'Incidentes', 'Dispositivos'] as const

export function SeguridadPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Auditoría')
  return (
    <div>
      <PageHeader title="Seguridad y monitoreo" description="Bitácora inmutable, eventos, incidentes y dispositivos de confianza." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((item) => <Button key={item} tone={tab === item ? 'primary' : 'ghost'} onClick={() => setTab(item)}>{item}</Button>)}
      </div>
      {tab === 'Auditoría' ? <Auditoria /> : null}
      {tab === 'Eventos' ? <Eventos /> : null}
      {tab === 'Incidentes' ? <Incidentes /> : null}
      {tab === 'Dispositivos' ? <Dispositivos /> : null}
    </div>
  )
}

function Auditoria() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['auditoria', q, page], queryFn: () => api.listAuditoria({ q, page }) })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso a la bitácora" body={errorText(query.error)} />
  return (
    <div>
      <TextInput className="mb-3 max-w-sm" aria-label="Buscar en auditoría" placeholder="Buscar acción" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-muted"><tr>{['Fecha', 'Acción', 'Entidad', 'Resultado', 'IP', 'Dispositivo'].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
          <tbody>
            {query.data?.items.map((log) => (
              <tr key={log.id} className="border-t border-line">
                <td className="px-3 py-2">{formatDateTime(log.fecha)}</td>
                <td className="px-3 py-2">{log.accion}</td>
                <td className="px-3 py-2">{log.entidad}</td>
                <td className="px-3 py-2"><Badge tone={log.resultado === 'exito' ? 'ok' : 'danger'}>{log.resultado === 'exito' ? 'Éxito' : 'Fallo'}</Badge></td>
                <td className="px-3 py-2">{log.ip}</td>
                <td className="px-3 py-2">{log.dispositivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
    </div>
  )
}

function Eventos() {
  const [severidad, setSeveridad] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['eventos', severidad, page], queryFn: () => api.listEventos({ severidad, page }) })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso a los eventos" body={errorText(query.error)} />
  return (
    <div>
      <SelectInput className="mb-3 max-w-xs" aria-label="Severidad" value={severidad} onChange={(event) => { setSeveridad(event.target.value); setPage(1) }}>
        <option value="">Todas</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option>
      </SelectInput>
      <div className="space-y-2">
        {query.data?.items.map((event) => (
          <Panel key={event.id}>
            <div className="flex flex-wrap items-center gap-2"><Badge tone={toneFor(event.severidad)}>{SEVERIDAD[event.severidad]}</Badge><span className="text-xs text-muted">{formatDateTime(event.fecha)} · {event.pais}</span></div>
            <p className="mt-2 font-medium">{event.tipo.replaceAll('_', ' ')}</p>
            <p className="text-sm text-muted">{event.descripcion}</p>
          </Panel>
        ))}
      </div>
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
    </div>
  )
}

function Incidentes() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', severidad: 'alta' as Severidad, estado: 'abierto' as EstadoIncidente, asignadoA: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [nota, setNota] = useState<Record<string, string>>({})
  const query = useQuery({ queryKey: ['incidentes'], queryFn: () => api.listIncidentes() })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso a incidentes" body={errorText(query.error)} />
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = incidenteSchema.safeParse({ ...form, asignadoA: form.asignadoA || null })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    try {
      await api.saveIncidente(parsed.data)
      toast.push('Incidente creado.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['incidentes'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <div className="space-y-3">
      {session.role === 'admin' || session.role === 'auditor_seguridad' ? <Button onClick={() => setOpen(true)}>Nuevo incidente</Button> : null}
      {query.data?.map((incidente) => (
        <Panel key={incidente.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{incidente.codigo}</span>
            <Badge tone={toneFor(incidente.severidad)}>{SEVERIDAD[incidente.severidad]}</Badge>
            <Badge tone={toneFor(incidente.estado)}>{INCIDENTE_ESTADO[incidente.estado]}</Badge>
          </div>
          <h3 className="mt-2 font-semibold">{incidente.titulo}</h3>
          <p className="text-sm text-muted">{incidente.descripcion}</p>
          <p className="mt-1 text-xs text-muted">Asignado a {incidente.asignadoNombre} · {formatDateTime(incidente.fecha)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['abierto', 'investigando', 'contenido', 'cerrado'] as const).map((estado) => (
              <Button key={estado} tone="ghost" onClick={() => void api.setIncidenteEstado(incidente.id, estado, incidente.asignadoA).then(() => queryClient.invalidateQueries({ queryKey: ['incidentes'] })).catch((error: unknown) => toast.push(errorText(error), 'error'))}>{INCIDENTE_ESTADO[estado]}</Button>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {incidente.notas.map((item) => <li key={item.id} className="rounded-lg bg-canvas px-3 py-2"><span className="font-medium">{item.autor}: </span>{item.texto}</li>)}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(event) => {
            event.preventDefault()
            const parsed = notaSchema.safeParse({ texto: nota[incidente.id] ?? '' })
            if (!parsed.success) return toast.push(parsed.error.issues[0]?.message ?? 'Escriba una nota.', 'error')
            void api.addNota(incidente.id, parsed.data.texto).then(async () => { setNota({ ...nota, [incidente.id]: '' }); await queryClient.invalidateQueries({ queryKey: ['incidentes'] }) }).catch((error: unknown) => toast.push(errorText(error), 'error'))
          }}>
            <TextInput aria-label="Nota del incidente" placeholder="Agregar nota" value={nota[incidente.id] ?? ''} onChange={(event) => setNota({ ...nota, [incidente.id]: event.target.value })} />
            <Button type="submit">Anotar</Button>
          </form>
        </Panel>
      ))}
      <Modal open={open} title="Nuevo incidente" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Título" error={errors.titulo}><TextInput value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} /></Field>
          <Field label="Descripción" error={errors.descripcion}><TextArea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
          <Field label="Severidad"><SelectInput value={form.severidad} onChange={(event) => setForm({ ...form, severidad: event.target.value as Severidad })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></SelectInput></Field>
          <Field label="Asignar a"><SelectInput value={form.asignadoA} onChange={(event) => setForm({ ...form, asignadoA: event.target.value })}><option value="">Sin asignar</option>{catalogo.data?.usuarios.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}</SelectInput></Field>
          <div className="flex justify-end"><Button type="submit">Crear</Button></div>
        </form>
      </Modal>
    </div>
  )
}

function Dispositivos() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['dispositivos'], queryFn: () => api.listDispositivos() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="No se pudieron cargar los dispositivos" body={errorText(query.error)} />
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas text-muted"><tr>{['Usuario', 'Dispositivo', 'País', 'Confianza', 'Último acceso', ''].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
        <tbody>
          {query.data?.map((device) => (
            <tr key={device.id} className="border-t border-line">
              <td className="px-3 py-3">{device.usuario}</td>
              <td className="px-3 py-3">{device.nombre}</td>
              <td className="px-3 py-3">{device.pais}</td>
              <td className="px-3 py-3"><Badge tone={device.confianza ? 'ok' : 'warn'}>{device.confianza ? 'De confianza' : 'Nuevo'}</Badge></td>
              <td className="px-3 py-3">{formatDateTime(device.ultimoAcceso)}</td>
              <td className="px-3 py-3"><button type="button" className="text-accentink" onClick={() => void api.setConfianza(device.id, !device.confianza).then(() => queryClient.invalidateQueries({ queryKey: ['dispositivos'] })).catch((error: unknown) => toast.push(errorText(error), 'error'))}>{device.confianza ? 'Retirar confianza' : 'Marcar de confianza'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
