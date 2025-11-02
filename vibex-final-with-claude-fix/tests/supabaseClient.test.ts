import { validateAndCleanSession } from '../lib/supabaseClient';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('supabaseClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not remove a valid session', () => {
    const validSession = {
      user: { id: '123', aud: 'authenticated' },
      expires_at: Date.now() / 1000 + 3600,
    };
    localStorage.setItem('sb-rblpwmgbuqjwevqngqkm-auth-token', JSON.stringify(validSession));
    validateAndCleanSession();
    expect(localStorage.getItem('sb-rblpwmgbuqjwevqngqkm-auth-token')).not.toBeNull();
  });

  it('should remove an expired session', () => {
    const expiredSession = {
      user: { id: '123', aud: 'authenticated' },
      expires_at: Date.now() / 1000 - 3600,
    };
    localStorage.setItem('sb-rblpwmgbuqjwevqngqkm-auth-token', JSON.stringify(expiredSession));
    vi.advanceTimersByTime(1000);
    validateAndCleanSession();
    expect(localStorage.getItem('sb-rblpwmgbuqjwevqngqkm-auth-token')).toBeNull();
  });

  it('should remove a session with an unauthenticated user', () => {
    const unauthenticatedSession = {
      user: { id: '123', aud: 'anon' },
      expires_at: Date.now() / 1000 + 3600,
    };
    localStorage.setItem('sb-rblpwmgbuqjwevqngqkm-auth-token', JSON.stringify(unauthenticatedSession));
    vi.advanceTimersByTime(1000);
    validateAndCleanSession();
    expect(localStorage.getItem('sb-rblpwmgbuqjwevqngqkm-auth-token')).toBeNull();
  });

  it('should remove a session with a missing user', () => {
    const sessionWithNoUser = {
      expires_at: Date.now() / 1000 + 3600,
    };
    localStorage.setItem('sb-rblpwmgbuqjwevqngqkm-auth-token', JSON.stringify(sessionWithNoUser));
    vi.advanceTimersByTime(1000);
    validateAndCleanSession();
    expect(localStorage.getItem('sb-rblpwmgbuqjwevqngqkm-auth-token')).toBeNull();
  });
});
