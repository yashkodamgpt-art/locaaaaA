import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App';
import { supabase } from '../lib/supabaseClient';

vi.mock('../components/auth/Login', () => ({
    default: ({ switchToSignUp }: { switchToSignUp: () => void }) => (
        <div>
        <h1>Login</h1>
        <button onClick={switchToSignUp}>Sign up here</button>
        </div>
    ),
    }));

vi.mock('../components/auth/SignUp', () => ({
default: ({ switchToLogin }: { switchToLogin: () => void }) => (
    <div>
    <h1>Create an account</h1>
    <button onClick={switchToLogin}>Switch to Login</button>
    </div>
),
}));

vi.mock('../MainApp', () => ({
    default: ({ onLogout }: { onLogout: () => void }) => (
        <div>
        <h1>Main App Content</h1>
        <button onClick={onLogout}>Logout</button>
        </div>
    ),
}));

// Mock the supabase client
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: {}, error: null }),
          })),
        })),
      })),
    })),
  },
  validateAndCleanSession: vi.fn(),
}));

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
            data: { session: null },
            error: null,
          });
    });
  it('renders the login view by default', async () => {
    render(<App />);
    await waitFor(() => {
        expect(screen.getByText('Login')).toBeInTheDocument();
      });
  });

  it('switches to the sign-up view', async () => {
    render(<App />);
    await waitFor(() => {
      fireEvent.click(screen.getByText('Sign up here'));
    });
    expect(await screen.findByText('Create an account')).toBeInTheDocument();
  });

  it('logs in a user and displays the main app', async () => {
    // @ts-ignore
    supabase.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: '123', email: 'test@example.com', aud: 'authenticated' },
          },
        },
      });
    // @ts-ignore
    supabase.from.mockReturnValue({
        select: () => ({
            eq: () => ({
                maybeSingle: () => ({
                    data: {
                        id: '123',
                        username: 'test',
                        bio: '',
                        privacy: 'public'
                    }
                })
            })
        })
    });
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Main App Content')).toBeInTheDocument();
      });
  });

  it('logs out a user and returns to the login view', async () => {
    // @ts-ignore
    supabase.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: '123', email: 'test@example.com', aud: 'authenticated' },
          },
        },
      });
    // @ts-ignore
    supabase.from.mockReturnValue({
        select: () => ({
            eq: () => ({
                maybeSingle: () => ({
                    data: {
                        id: '123',
                        username: 'test',
                        bio: '',
                        privacy: 'public'
                    }
                })
            })
        })
    });

    render(<App />);

    await waitFor(() => {
        expect(screen.getByText('Main App Content')).toBeInTheDocument();
      });

    await waitFor(() => {
        fireEvent.click(screen.getByText('Logout'));
    });

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });
  it('initializes the auth state only once', async () => {
    render(<App />);
    // Wait for the component to finish its initial loading sequence.
    // When loading is false, it should show the Login component.
    await screen.findByText('Login');

    // At this point, all the initial useEffect shenanigans should be over.
    // Now we can accurately check the call count.
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
  });
});
