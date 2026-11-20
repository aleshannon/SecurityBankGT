import type { Role, User, UserRoleRow } from '@/domain/types'
import { hashSecret } from './hash'

export interface DemoAccount {
  id: string
  role: Role
  email: string
  password: string
  nombre: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'user-admin',
    role: 'admin',
    email: 'admin@securitybankgt.com',
    password: 'Admin#2026Gtq!',
    nombre: 'Andrea Castillo Ruiz',
  },
  {
    id: 'user-auditor',
    role: 'auditor_seguridad',
    email: 'auditor@securitybankgt.com',
    password: 'Auditor#2026Gt!',
    nombre: 'Héctor Morales Díaz',
  },
  {
    id: 'user-ejecutivo',
    role: 'ejecutivo',
    email: 'ejecutivo@securitybankgt.com',
    password: 'Ejecutivo#2026!',
    nombre: 'Lucía Fernández Gómez',
  },
  {
    id: 'user-cliente',
    role: 'cliente',
    email: 'cliente@securitybankgt.com',
    password: 'Cliente#2026Gt!',
    nombre: 'María José García Morales',
  },
]

export function directory(): { users: User[]; roles: UserRoleRow[] } {
  return {
    users: DEMO_ACCOUNTS.map((account) => ({
      id: account.id,
      email: account.email,
      nombre: account.nombre,
      passwordHash: hashSecret(account.password, account.id),
      paisHabitual: 'GT',
    })),
    roles: DEMO_ACCOUNTS.map((account) => ({ userId: account.id, role: account.role })),
  }
}
