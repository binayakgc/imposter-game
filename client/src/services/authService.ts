// client/src/services/authService.ts
// Frontend authentication service with persistent login

const API_BASE_URL = 'http://localhost:3001/api';

// Interfaces
export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  isOnline: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
}

export interface RegisterData {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
}

export interface LoginData {
  username: string;
  password: string;
}

class AuthServiceClass {
  private user: User | null = null;
  private token: string | null = null;
  private listeners: Array<(user: User | null) => void> = [];

  constructor() {
    // Initialize from localStorage on startup
    this.initializeFromStorage();
  }

  /**
   * Initialize authentication state from localStorage
   */
  private initializeFromStorage(): void {
    try {
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('authUser');

      if (storedToken && storedUser) {
        this.token = storedToken;
        this.user = JSON.parse(storedUser);
        
        // Validate the stored session
        this.validateStoredSession();
      }
    } catch (error) {
      console.error('Failed to initialize auth from storage:', error);
      this.clearStorage();
    }
  }

  /**
   * Validate stored session with server
   */
  private async validateStoredSession(): Promise<void> {
    if (!this.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Session validation failed');
      }

      const result = await response.json();
      
      if (result.success && result.data.user) {
        this.user = result.data.user;
        this.notifyListeners();
        console.log('✅ Session validated successfully');
      } else {
        throw new Error('Invalid session response');
      }

    } catch (error) {
      console.warn('Session validation failed, clearing storage:', error);
      this.logout();
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // Validate password strength
    if (data.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Validate username
    if (data.username.length < 2 || data.username.length > 20) {
      throw new Error('Username must be 2-20 characters long');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          email: data.email || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      if (result.success && result.data) {
        this.setAuthData(result.data);
        console.log('✅ User registered successfully');
        return result.data;
      } else {
        throw new Error('Invalid registration response');
      }

    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    if (!data.username || !data.password) {
      throw new Error('Username and password are required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      if (result.success && result.data) {
        this.setAuthData(result.data);
        console.log('✅ User logged in successfully');
        return result.data;
      } else {
        throw new Error('Invalid login response');
      }

    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.token) {
        // Notify server of logout
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local data regardless of API call result
      this.clearAuthData();
      console.log('✅ User logged out');
    }
  }

  /**
   * Check if username is available
   */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    if (!username || username.length < 2) {
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/username-available/${encodeURIComponent(username)}`);
      const result = await response.json();
      
      return result.success && result.data.available;
    } catch (error) {
      console.error('Username availability check failed:', error);
      return false;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.user;
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.user && this.token);
  }

  /**
   * Get auth header for API requests
   */
  getAuthHeader(): Record<string, string> {
    if (this.token) {
      return {
        'Authorization': `Bearer ${this.token}`,
      };
    }
    return {};
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback);
    
    // Immediately call with current state
    callback(this.user);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Private helper methods
   */
  private setAuthData(data: AuthResponse): void {
    this.user = data.user;
    this.token = data.token;

    // Store in localStorage
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('authUser', JSON.stringify(data.user));

    this.notifyListeners();
  }

  private clearAuthData(): void {
    this.user = null;
    this.token = null;
    this.clearStorage();
    this.notifyListeners();
  }

  private clearStorage(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.user);
      } catch (error) {
        console.error('Auth listener error:', error);
      }
    });
  }

  /**
   * Create an authenticated fetch wrapper
   */
  authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const authHeaders = this.getAuthHeader();
    
    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    };

    const response = await fetch(url, mergedOptions);

    // If request fails with 401, try to refresh or logout
    if (response.status === 401) {
      console.warn('Authenticated request failed with 401, logging out');
      this.logout();
    }

    return response;
  };
}

// Export singleton instance
export const authService = new AuthServiceClass();
export default authService;