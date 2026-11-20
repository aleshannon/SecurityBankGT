import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDate } from '@/domain/format'
import { CAPA_LABEL, HALLAZGO_ESTADO, ORIGEN_LABEL, OWASP_LABEL, SEVERIDAD, toneFor } from '@/domain/labels'
import { casoSchema, hallazgoSchema } from '@/domain/schemas'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Panel, SelectInput, SkeletonRows, TextArea, TextInput, fieldErrors } from '@/components/ui'

export function HallazgosPage() {
  const [tab, setTab] = useState<'hallazgos' | 'casos'>('hallazgos')
  return (
    <div>
      <PageHeader title="Hallazgos" description="Vulnerabilidades según OWASP API Security Top 10 2023 y casos de abuso con su control." />
      <div className="mb-4 flex gap-2"><Button tone={tab === 'hallazgos' ? 'primary' : 'ghost'} onClick={() => setTab('hallazgos')}>Hallazgos</Button><Button tone={tab === 'casos' ? 'primary' : 'ghost'} onClick={() => setTab('casos')}>Casos de abuso</Button></div>
      {tab === 'hallazgos' ? <Lista /> : <Casos />}
    </div>
  )
}

function Lista() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['hallazgos'], queryFn: () => api.listHallazgos() })
  const [open, setOpen] = useState(false)
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso a los hallazgos" body={errorText(query.error)} />
  return (
    <div className="space-y-3">
      {session.role === 'admin' ? <Button onClick={() => setOpen(true)}>Registrar hallazgo</Button> : null}
      {query.data?.map((item) => {
        const vencido = item.fechaLimite < new Date().toISOString().slice(0, 10) && (item.estado === 'abierto' || item.estado === 'en_progreso')
        return (
          <Panel key={item.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.codigo}</span>
              <Badge tone={toneFor(item.severidad)}>{SEVERIDAD[item.severidad]} · CVSS {item.cvss.toFixed(1)}</Badge>
              <Badge>{OWASP_LABEL[item.owasp]}</Badge>
              <Badge tone={toneFor(item.estado)}>{HALLAZGO_ESTADO[item.estado]}</Badge>
              {vencido ? <Badge tone="danger">Fuera de plazo</Badge> : null}
            </div>
            <h3 className="mt-2 font-semibold">{item.titulo}</h3>
            <p className="text-sm text-muted">{ORIGEN_LABEL[item.origen]} · {CAPA_LABEL[item.capa]} · {item.activoNombre}</p>
            <p className="mt-2 text-sm"><span className="font-medium">Evidencia. </span>{item.evidencia}</p>
            <p className="mt-1 text-sm"><span className="font-medium">Mitigación. </span>{item.recomendacion}</p>
            <p className="mt-2 text-xs text-muted">Responsable: {item.responsable} · límite {formatDate(item.fechaLimite)}</p>
            {session.role === 'admin' || session.role === 'auditor_seguridad' ? (
              <div className="mt-3">
                <SelectInput aria-label="Estado del hallazgo" value={item.estado} onChange={(event) => void api.saveHallazgo({ ...item, estado: event.target.value }).then(() => queryClient.invalidateQueries({ queryKey: ['hallazgos'] })).catch((error: unknown) => toast.push(errorText(error), 'error'))}>
                  <option value="abierto">Abierto</option><option value="en_progreso">En progreso</option><option value="mitigado">Mitigado</option><option value="aceptado">Aceptado</option>
                </SelectInput>
              </div>
            ) : null}
          </Panel>
        )
      })}
      <HallazgoForm open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function HallazgoForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const activos = useQuery({ queryKey: ['activos'], queryFn: () => api.listActivos(), enabled: open })
  const [form, setForm] = useState({ titulo: '', origen: 'pentest_caja_gris', owasp: 'API1', severidad: 'alta', cvss: '5.0', activoId: '', evidencia: '', recomendacion: '', responsable: '', estado: 'abierto', fechaLimite: '', capa: 'aplicacion' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = hallazgoSchema.safeParse({ ...form, cvss: Number(form.cvss) })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    try {
      await api.saveHallazgo(parsed.data)
      toast.push('Hallazgo registrado.', 'ok')
      onClose()
      await queryClient.invalidateQueries({ queryKey: ['hallazgos'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <Modal open={open} title="Nuevo hallazgo" onClose={onClose} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Field label="Título" error={errors.titulo}><TextInput value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} /></Field>
        <Field label="Activo" error={errors.activoId}><SelectInput value={form.activoId} onChange={(event) => setForm({ ...form, activoId: event.target.value })}><option value="">Seleccione</option>{activos.data?.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</SelectInput></Field>
        <Field label="Origen"><SelectInput value={form.origen} onChange={(event) => setForm({ ...form, origen: event.target.value })}>{Object.entries(ORIGEN_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput></Field>
        <Field label="OWASP"><SelectInput value={form.owasp} onChange={(event) => setForm({ ...form, owasp: event.target.value })}>{Object.entries(OWASP_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput></Field>
        <Field label="CVSS" error={errors.cvss}><TextInput value={form.cvss} onChange={(event) => setForm({ ...form, cvss: event.target.value })} /></Field>
        <Field label="Fecha límite" error={errors.fechaLimite}><TextInput type="date" value={form.fechaLimite} onChange={(event) => setForm({ ...form, fechaLimite: event.target.value })} /></Field>
        <Field label="Evidencia" error={errors.evidencia}><TextArea value={form.evidencia} onChange={(event) => setForm({ ...form, evidencia: event.target.value })} /></Field>
        <Field label="Recomendación" error={errors.recomendacion}><TextArea value={form.recomendacion} onChange={(event) => setForm({ ...form, recomendacion: event.target.value })} /></Field>
        <Field label="Responsable" error={errors.responsable}><TextInput value={form.responsable} onChange={(event) => setForm({ ...form, responsable: event.target.value })} /></Field>
        <Field label="Capa"><SelectInput value={form.capa} onChange={(event) => setForm({ ...form, capa: event.target.value })}>{Object.entries(CAPA_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput></Field>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit">Guardar</Button></div>
      </form>
    </Modal>
  )
}

function Casos() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['casos'], queryFn: () => api.listCasos() })
  const hallazgos = useQuery({ queryKey: ['hallazgos'], queryFn: () => api.listHallazgos() })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', control: '', hallazgoId: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso" body={errorText(query.error)} />
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = casoSchema.safeParse(form)
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    try {
      await api.saveCaso(parsed.data)
      toast.push('Caso registrado.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['casos'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <div className="space-y-3">
      {session.role === 'admin' ? <Button onClick={() => setOpen(true)}>Registrar caso</Button> : null}
      {query.data?.map((item) => (
        <Panel key={item.id}>
          <p className="text-xs text-muted">{item.codigo}</p>
          <h3 className="font-semibold">{item.titulo}</h3>
          <p className="mt-1 text-sm">{item.descripcion}</p>
          <p className="mt-2 text-sm"><span className="font-medium">Control compensatorio. </span>{item.control}</p>
        </Panel>
      ))}
      <Modal open={open} title="Caso de abuso" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Título" error={errors.titulo}><TextInput value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} /></Field>
          <Field label="Descripción" error={errors.descripcion}><TextArea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
          <Field label="Control compensatorio" error={errors.control}><TextArea value={form.control} onChange={(event) => setForm({ ...form, control: event.target.value })} /></Field>
          <Field label="Hallazgo" error={errors.hallazgoId}><SelectInput value={form.hallazgoId} onChange={(event) => setForm({ ...form, hallazgoId: event.target.value })}><option value="">Seleccione</option>{hallazgos.data?.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.titulo}</option>)}</SelectInput></Field>
          <Button type="submit">Guardar</Button>
        </form>
      </Modal>
    </div>
  )
}
