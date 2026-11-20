import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { matrizCalor } from '@/domain/matrix'
import { CAPAS, CAPA_LABEL, RIESGO_NIVEL, STRIDE, TRATAMIENTO_LABEL, toneFor } from '@/domain/labels'
import { activoSchema, amenazaSchema, riesgoSchema } from '@/domain/schemas'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Panel, SelectInput, SkeletonRows, TextArea, TextInput, fieldErrors } from '@/components/ui'

const tabs = ['Activos', 'Amenazas', 'Riesgos', 'Matriz', 'Capas'] as const

export function RiesgosPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Matriz')
  return (
    <div>
      <PageHeader title="Gestión de riesgos" description="Inventario ISO 27001, amenazas STRIDE, puntaje DREAD y tratamiento." />
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map((item) => <Button key={item} tone={tab === item ? 'primary' : 'ghost'} onClick={() => setTab(item)}>{item}</Button>)}</div>
      {tab === 'Activos' ? <Activos /> : null}
      {tab === 'Amenazas' ? <Amenazas /> : null}
      {tab === 'Riesgos' ? <Riesgos /> : null}
      {tab === 'Matriz' ? <Matriz /> : null}
      {tab === 'Capas' ? <Capas /> : null}
    </div>
  )
}

function Activos() {
  const { session } = useAuth()
  const query = useQuery({ queryKey: ['activos'], queryFn: () => api.listActivos() })
  const [open, setOpen] = useState(false)
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso al inventario" body={errorText(query.error)} />
  return (
    <div>
      {session.role === 'admin' ? <div className="mb-3"><Button onClick={() => setOpen(true)}>Nuevo activo</Button></div> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-muted"><tr>{['ID', 'Nombre', 'Proceso', 'Tipo', 'Ubicación', 'C', 'I', 'A', 'Criticidad', 'Propietario'].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
          <tbody>
            {query.data?.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-3 py-2">{item.codigo}</td><td className="px-3 py-2">{item.nombre}</td><td className="px-3 py-2">{item.proceso}</td><td className="px-3 py-2">{item.tipo}</td><td className="px-3 py-2">{item.ubicacion}</td>
                <td className="px-3 py-2">{item.confidencialidad}</td><td className="px-3 py-2">{item.integridad}</td><td className="px-3 py-2">{item.disponibilidad}</td>
                <td className="px-3 py-2"><Badge tone={item.criticidad === 'Alta' ? 'danger' : item.criticidad === 'Media' ? 'warn' : 'ok'}>{item.criticidad}</Badge></td>
                <td className="px-3 py-2">{item.propietario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActivoForm open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function ActivoForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ nombre: '', proceso: '', tipo: 'software', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Media', propietario: '', custodio: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = activoSchema.safeParse(form)
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    try {
      await api.saveActivo(parsed.data)
      toast.push('Activo registrado. La criticidad se calculó con el mayor valor CIA.', 'ok')
      onClose()
      await queryClient.invalidateQueries({ queryKey: ['activos'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <Modal open={open} title="Nuevo activo" onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Field label="Nombre" error={errors.nombre}><TextInput value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></Field>
        <Field label="Proceso" error={errors.proceso}><TextInput value={form.proceso} onChange={(event) => setForm({ ...form, proceso: event.target.value })} /></Field>
        <Field label="Tipo"><SelectInput value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}><option value="informacion">Información</option><option value="software">Software</option><option value="fisico">Físico</option><option value="personal">Personal</option><option value="servicios">Servicios</option></SelectInput></Field>
        <Field label="Ubicación"><SelectInput value={form.ubicacion} onChange={(event) => setForm({ ...form, ubicacion: event.target.value })}><option value="cloud">Cloud</option><option value="movil">Móvil</option><option value="repositorio">Repositorio</option></SelectInput></Field>
        {(['confidencialidad', 'integridad', 'disponibilidad'] as const).map((key) => (
          <Field key={key} label={key}><SelectInput value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></SelectInput></Field>
        ))}
        <Field label="Propietario" error={errors.propietario}><TextInput value={form.propietario} onChange={(event) => setForm({ ...form, propietario: event.target.value })} /></Field>
        <Field label="Custodio" error={errors.custodio}><TextInput value={form.custodio} onChange={(event) => setForm({ ...form, custodio: event.target.value })} /></Field>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit">Guardar</Button></div>
      </form>
    </Modal>
  )
}

function Amenazas() {
  const query = useQuery({ queryKey: ['amenazas'], queryFn: () => api.listAmenazas() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso" body={errorText(query.error)} />
  return (
    <div className="grid gap-3">
      {query.data?.map((item) => (
        <Panel key={item.id}>
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.codigo}</span><Badge>{STRIDE[item.categoria]}</Badge><Badge tone={toneFor(item.nivel)}>{RIESGO_NIVEL[item.nivel]} · {item.promedio}</Badge></div>
          <h3 className="mt-2 font-semibold">{item.nombre}</h3>
          <p className="text-sm text-muted">{item.descripcion}</p>
          <p className="mt-2 text-xs text-muted">D {item.damage} · R {item.reproducibility} · E {item.exploitability} · A {item.affectedUsers} · D {item.discoverability}</p>
        </Panel>
      ))}
      <AmenazaForm />
    </div>
  )
}

function AmenazaForm() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const activos = useQuery({ queryKey: ['activos'], queryFn: () => api.listActivos() })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', categoria: 'Spoofing', damage: '5', reproducibility: '5', exploitability: '5', affectedUsers: '5', discoverability: '5', activoId: '' })
  if (session.role !== 'admin') return null
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = amenazaSchema.safeParse({ ...form, damage: Number(form.damage), reproducibility: Number(form.reproducibility), exploitability: Number(form.exploitability), affectedUsers: Number(form.affectedUsers), discoverability: Number(form.discoverability) })
    if (!parsed.success) return toast.push(parsed.error.issues[0]?.message ?? 'Revise el formulario.', 'error')
    try {
      await api.saveAmenaza(parsed.data)
      toast.push('Amenaza registrada.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['amenazas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>Nueva amenaza</Button>
      <Modal open={open} title="Amenaza STRIDE" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Nombre"><TextInput value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></Field>
          <Field label="Descripción"><TextArea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
          <Field label="Categoría"><SelectInput value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>{Object.keys(STRIDE).map((key) => <option key={key} value={key}>{STRIDE[key as keyof typeof STRIDE]}</option>)}</SelectInput></Field>
          <Field label="Activo"><SelectInput value={form.activoId} onChange={(event) => setForm({ ...form, activoId: event.target.value })}><option value="">Seleccione</option>{activos.data?.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</SelectInput></Field>
          <div className="grid grid-cols-5 gap-2">{(['damage', 'reproducibility', 'exploitability', 'affectedUsers', 'discoverability'] as const).map((key) => <TextInput key={key} aria-label={key} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}</div>
          <Button type="submit">Guardar</Button>
        </form>
      </Modal>
    </>
  )
}

function Riesgos() {
  const query = useQuery({ queryKey: ['riesgos'], queryFn: () => api.listRiesgos() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError) return <EmptyState title="Sin acceso" body={errorText(query.error)} />
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas text-muted"><tr>{['ID', 'Título', 'Inherente', 'Residual', 'Tratamiento', 'Tipo'].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
        <tbody>
          {query.data?.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <td className="px-3 py-2">{item.codigo}</td>
              <td className="px-3 py-2">{item.titulo}</td>
              <td className="px-3 py-2">{item.riesgoInherente}</td>
              <td className="px-3 py-2">{item.riesgoResidual}</td>
              <td className="px-3 py-2">{TRATAMIENTO_LABEL[item.tratamiento]}</td>
              <td className="px-3 py-2">{item.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RiesgoForm />
    </div>
  )
}

function RiesgoForm() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const activos = useQuery({ queryKey: ['activos'], queryFn: () => api.listActivos(), enabled: session.role === 'admin' })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', probabilidad: '3', impacto: '3', controles: '', probabilidadResidual: '2', impactoResidual: '2', tipo: 'seguridad', tipoImpacto: 'operacional', tratamiento: 'mitigar', activoId: '' })
  if (session.role !== 'admin') return null
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = riesgoSchema.safeParse({ ...form, probabilidad: Number(form.probabilidad), impacto: Number(form.impacto), probabilidadResidual: Number(form.probabilidadResidual), impactoResidual: Number(form.impactoResidual) })
    if (!parsed.success) return toast.push(parsed.error.issues[0]?.message ?? 'Revise el formulario.', 'error')
    try {
      await api.saveRiesgo(parsed.data)
      toast.push('Riesgo registrado.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['riesgos'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <div className="p-3">
      <Button onClick={() => setOpen(true)}>Nuevo riesgo</Button>
      <Modal open={open} title="Registrar riesgo" onClose={() => setOpen(false)} wide>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
          <Field label="Título"><TextInput value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} /></Field>
          <Field label="Activo"><SelectInput value={form.activoId} onChange={(event) => setForm({ ...form, activoId: event.target.value })}><option value="">Seleccione</option>{activos.data?.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</SelectInput></Field>
          <Field label="Descripción"><TextArea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
          <Field label="Controles"><TextArea value={form.controles} onChange={(event) => setForm({ ...form, controles: event.target.value })} /></Field>
          <Field label="Probabilidad 1-5"><TextInput value={form.probabilidad} onChange={(event) => setForm({ ...form, probabilidad: event.target.value })} /></Field>
          <Field label="Impacto 1-5"><TextInput value={form.impacto} onChange={(event) => setForm({ ...form, impacto: event.target.value })} /></Field>
          <Field label="Probabilidad residual"><TextInput value={form.probabilidadResidual} onChange={(event) => setForm({ ...form, probabilidadResidual: event.target.value })} /></Field>
          <Field label="Impacto residual"><TextInput value={form.impactoResidual} onChange={(event) => setForm({ ...form, impactoResidual: event.target.value })} /></Field>
          <Field label="Tratamiento"><SelectInput value={form.tratamiento} onChange={(event) => setForm({ ...form, tratamiento: event.target.value })}>{Object.entries(TRATAMIENTO_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput></Field>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
    </div>
  )
}

function Matriz() {
  const query = useQuery({ queryKey: ['riesgos'], queryFn: () => api.listRiesgos() })
  const [modo, setModo] = useState<'antes' | 'despues'>('antes')
  const [seleccion, setSeleccion] = useState<number | null>(null)
  if (query.isLoading) return <SkeletonRows />
  if (query.isError || !query.data) return <EmptyState title="Sin acceso" body={errorText(query.error)} />
  const celdas = matrizCalor(query.data, modo)
  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Momento de la matriz">
        <Button tone={modo === 'antes' ? 'primary' : 'ghost'} onClick={() => { setModo('antes'); setSeleccion(null) }}>Antes de controles</Button>
        <Button tone={modo === 'despues' ? 'primary' : 'ghost'} onClick={() => { setModo('despues'); setSeleccion(null) }}>Después de controles</Button>
      </div>
      <div className="grid max-w-3xl grid-cols-[auto_1fr] gap-2">
        <div />
        <div className="grid grid-cols-5 text-center text-xs text-muted">{[1, 2, 3, 4, 5].map((impacto) => <span key={impacto}>Impacto {impacto}</span>)}</div>
        {[5, 4, 3, 2, 1].map((probabilidad) => (
          <div key={probabilidad} className="contents">
            <span className="self-center text-xs text-muted">P{probabilidad}</span>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((impacto) => {
                const index = celdas.findIndex((celda) => celda.probabilidad === probabilidad && celda.impacto === impacto)
                const celda = celdas[index]
                return <button key={impacto} type="button" className={`h-14 rounded-lg text-sm font-semibold ${heatClass(probabilidad * impacto)}`} onClick={() => setSeleccion(index)}>{celda?.total ?? 0}</button>
              })}
            </div>
          </div>
        ))}
      </div>
      {seleccion !== null && celdas[seleccion] ? (
        <Panel className="mt-4">
          <h2 className="font-semibold">Riesgos en esta celda</h2>
          {celdas[seleccion].riesgos.length === 0 ? <p className="mt-2 text-sm text-muted">No hay riesgos en esta combinación.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{celdas[seleccion].riesgos.map((item) => <li key={item.id}>{item.titulo} · valor {item.valor}</li>)}</ul>
          )}
        </Panel>
      ) : null}
    </div>
  )
}

function Capas() {
  const query = useQuery({ queryKey: ['hallazgos'], queryFn: () => api.listHallazgos() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError || !query.data) return <EmptyState title="Sin acceso" body={errorText(query.error)} />
  const max = Math.max(1, ...CAPAS.map((capa) => query.data.filter((item) => item.capa === capa.id).length))
  return (
    <div className="grid gap-3">
      {CAPAS.map((capa) => {
        const total = query.data.filter((item) => item.capa === capa.id).length
        const abiertos = query.data.filter((item) => item.capa === capa.id && (item.estado === 'abierto' || item.estado === 'en_progreso')).length
        return (
          <Panel key={capa.id}>
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{CAPA_LABEL[capa.id]}</h3><p className="text-sm text-muted">{capa.descripcion}</p></div><Badge tone={abiertos ? 'warn' : 'ok'}>{total} hallazgos · {abiertos} abiertos</Badge></div>
            <div className="mt-3 h-2 rounded-full bg-canvas"><div className="h-2 rounded-full bg-accent" style={{ width: `${(total / max) * 100}%` }} /></div>
          </Panel>
        )
      })}
    </div>
  )
}

function heatClass(score: number) {
  if (score >= 20) return 'bg-rose-700 text-white'
  if (score >= 15) return 'bg-orange-500 text-white'
  if (score >= 10) return 'bg-amber-300 text-navy'
  if (score >= 5) return 'bg-lime-200 text-navy'
  return 'bg-emerald-100 text-navy'
}
