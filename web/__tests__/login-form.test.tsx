import { expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/components/login-form'

const signInWithPassword = vi.fn()
const push = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  signInWithPassword.mockReset()
  push.mockReset()
})

test('submits email and password, redirects to /select-farm on success', async () => {
  signInWithPassword.mockResolvedValue({ error: null })
  render(<LoginForm />)

  await userEvent.type(screen.getByLabelText(/email/i), 'manager@test.local')
  await userEvent.type(screen.getByLabelText(/contraseña/i), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

  await waitFor(() => {
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'manager@test.local',
      password: 'password123',
    })
    expect(push).toHaveBeenCalledWith('/select-farm')
  })
})

test('shows a generic error message on invalid credentials, does not redirect', async () => {
  signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
  render(<LoginForm />)

  await userEvent.type(screen.getByLabelText(/email/i), 'manager@test.local')
  await userEvent.type(screen.getByLabelText(/contraseña/i), 'wrong-password')
  await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

  expect(await screen.findByText(/email o contraseña incorrectos/i)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test('shows a connection error and re-enables the button when the request throws', async () => {
  signInWithPassword.mockRejectedValue(new Error('network error'))
  render(<LoginForm />)

  await userEvent.type(screen.getByLabelText(/email/i), 'manager@test.local')
  await userEvent.type(screen.getByLabelText(/contraseña/i), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))

  expect(await screen.findByText(/no se pudo conectar\. intentá de nuevo\./i)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()

  const button = screen.getByRole('button', { name: /ingresar/i })
  expect(button).not.toBeDisabled()
  expect(button).toHaveTextContent(/^ingresar$/i)
})
