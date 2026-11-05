export type AccountMode = 'sign-in' | 'sign-up';

export type AccountFormErrors = {
  email: boolean;
  password: boolean;
  confirmation: boolean;
};

export function validateAccountForm(
  mode: AccountMode,
  email: string,
  password: string,
  confirmation: string,
): AccountFormErrors {
  return {
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    password: password.length === 0,
    confirmation: mode === 'sign-up' && password !== confirmation,
  };
}
