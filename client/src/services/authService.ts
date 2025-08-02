// client/src/services/authService.ts
// ENHANCED LOGOUT FIX - Ensures logout always works

const API_BASE_URL = "http://localhost:3001/api";

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
      const storedToken = localStorage.getItem("authToken");
      const storedUser = localStorage.getItem("authUser");

      if (storedToken && storedUser) {
        this.token = storedToken;
        this.user = JSON.parse(storedUser);

        // Validate the stored session
        this.validateStoredSession();
      }
    } catch (error) {
      console.error("Failed to initialize auth from storage:", error);
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
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Session validation failed");
      }

      const result = await response.json();

      if (result.success && result.data.user) {
        this.user = result.data.user;
        this.notifyListeners();
        console.log("✅ Session validated successfully");
      } else {
        throw new Error("Invalid session response");
      }
    } catch (error) {
      console.warn("Session validation failed, clearing storage:", error);
      this.logout();
    }
  }

  /**
   * Register a new user
   */
  // client/src/services/authService.ts
  // ENHANCED REGISTER METHOD - Better error handling and validation

  /**
   * Register a new user with enhanced validation
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    console.log("🔍 Starting registration process...", {
      username: data.username,
      email: data.email,
      hasPassword: !!data.password,
      hasConfirmPassword: !!data.confirmPassword,
    });

    // ✅ ENHANCED: Client-side validation with detailed error messages
    if (!data.username || !data.username.trim()) {
      throw new Error("Username is required");
    }

    if (data.username.length < 2 || data.username.length > 20) {
      throw new Error("Username must be 2-20 characters long");
    }

    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      throw new Error(
        "Username can only contain letters, numbers, and underscores"
      );
    }

    if (!data.password) {
      throw new Error("Password is required");
    }

    if (data.password.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    if (!data.confirmPassword) {
      throw new Error("Please confirm your password");
    }

    if (data.password !== data.confirmPassword) {
      throw new Error("Passwords do not match");
    }

    // Email validation (if provided)
    if (data.email && data.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        throw new Error("Please enter a valid email address");
      }
    }

    try {
      console.log("🌐 Sending registration request to server...");

      // ✅ ENHANCED: Send complete data to backend (including confirmPassword)
      // The backend validation will handle the confirmPassword validation
      const requestBody = {
        username: data.username.trim(),
        password: data.password,
        confirmPassword: data.confirmPassword,
        email: data.email && data.email.trim() ? data.email.trim() : undefined,
      };

      console.log("📦 Request payload:", {
        ...requestBody,
        password: "[HIDDEN]",
        confirmPassword: "[HIDDEN]",
      });

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      console.log("📨 Server response:", {
        success: result.success,
        hasUser: !!result.data?.user,
        hasToken: !!result.data?.token,
        error: result.error,
      });

      if (!response.ok) {
        // ✅ ENHANCED: Better error message extraction
        let errorMessage = result.error || "Registration failed";

        // Handle specific error cases
        if (response.status === 409) {
          errorMessage = "Username is already taken";
        } else if (response.status === 400) {
          // Extract validation error details
          if (result.error && result.error.includes("confirmPassword")) {
            errorMessage = "Passwords do not match";
          } else if (result.error && result.error.includes("username")) {
            errorMessage = "Invalid username format";
          } else if (result.error && result.error.includes("password")) {
            errorMessage = "Password must be at least 6 characters";
          } else if (result.error && result.error.includes("email")) {
            errorMessage = "Invalid email format";
          }
        }

        throw new Error(errorMessage);
      }

      if (result.success && result.data) {
        console.log("✅ Registration successful!");
        this.setAuthData(result.data);
        return result.data;
      } else {
        throw new Error("Invalid registration response from server");
      }
    } catch (error) {
      console.error("❌ Registration failed:", error);

      // ✅ ENHANCED: Network error handling
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          "Unable to connect to server. Please check your internet connection."
        );
      }

      // Re-throw the original error if it's already a proper error message
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Login failed");
      }

      if (result.success && result.data) {
        this.setAuthData(result.data);
        console.log("✅ User logged in successfully");
        return result.data;
      } else {
        throw new Error("Invalid login response");
      }
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }

  /**
   * ✅ ENHANCED: Robust logout with multiple fallback methods
   */
  async logout(): Promise<void> {
    console.log("🚪 Starting logout process...");

    try {
      // Step 1: Try to call server logout API
      if (this.token) {
        try {
          console.log("🌐 Calling server logout API...");
          const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            console.log("✅ Server logout successful");
          } else {
            console.warn(
              "⚠️ Server logout failed, continuing with local logout"
            );
          }
        } catch (apiError) {
          console.warn(
            "⚠️ Logout API call failed, continuing with local logout:",
            apiError
          );
        }
      }
    } catch (error) {
      console.warn("⚠️ Logout process had errors, but continuing:", error);
    } finally {
      // Step 2: ALWAYS clear local data (this is the most important part)
      console.log("🧹 Clearing local authentication data...");
      this.clearAuthData();

      // Step 3: Force navigation to login page
      console.log("🔄 Forcing navigation to login...");

      // Try multiple navigation methods
      try {
        // Method 1: Use history API if available
        if (window.history && window.history.pushState) {
          window.history.pushState(null, "", "/login");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }

        // Method 2: Set window location (fallback)
        setTimeout(() => {
          window.location.href = "/login";
        }, 100);
      } catch (navError) {
        console.error("Navigation error, forcing page reload:", navError);
        // Method 3: Force page reload (ultimate fallback)
        window.location.reload();
      }

      console.log("✅ Logout process completed");
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
      const response = await fetch(
        `${API_BASE_URL}/auth/username-available/${encodeURIComponent(
          username
        )}`
      );
      const result = await response.json();

      return result.success && result.data.available;
    } catch (error) {
      console.error("Username availability check failed:", error);
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
    return !!this.user && !!this.token;
  }

  /**
   * Subscribe to authentication state changes
   */
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.listeners.push(callback);

    // Immediately call with current state
    callback(this.user);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(
        (listener) => listener !== callback
      );
    };
  }

  /**
   * Make authenticated requests
   */
  async authenticatedFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = this.getToken();

    if (!token) {
      throw new Error("No authentication token available");
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers: authHeaders,
    });

    // If unauthorized, clear auth data and redirect to login
    if (response.status === 401) {
      console.warn("Unauthorized request, logging out...");
      this.logout();
      throw new Error("Authentication expired");
    }

    return response;
  }

  /**
   * Set authentication data
   */
  private setAuthData(authData: AuthResponse): void {
    this.user = authData.user;
    this.token = authData.token;

    // Store in localStorage
    localStorage.setItem("authToken", authData.token);
    localStorage.setItem("authUser", JSON.stringify(authData.user));

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * ✅ ENHANCED: Clear authentication data with multiple cleanup methods
   */
  private clearAuthData(): void {
    console.log("🧹 Clearing all authentication data...");

    // Clear instance variables
    this.user = null;
    this.token = null;

    // Clear localStorage with error handling
    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      console.log("✅ localStorage cleared");
    } catch (storageError) {
      console.error("Error clearing localStorage:", storageError);
    }

    // Clear sessionStorage too (in case anything is stored there)
    try {
      sessionStorage.removeItem("authToken");
      sessionStorage.removeItem("authUser");
      console.log("✅ sessionStorage cleared");
    } catch (sessionError) {
      console.error("Error clearing sessionStorage:", sessionError);
    }

    // Clear any auth-related cookies
    try {
      document.cookie =
        "authToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie =
        "authUser=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      console.log("✅ Cookies cleared");
    } catch (cookieError) {
      console.error("Error clearing cookies:", cookieError);
    }

    // Notify all listeners LAST
    this.notifyListeners();
    console.log("✅ Authentication data fully cleared");
  }

  /**
   * Clear localStorage (for external use)
   */
  private clearStorage(): void {
    this.clearAuthData();
  }

  /**
   * Notify all listeners of auth state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((callback) => {
      try {
        callback(this.user);
      } catch (error) {
        console.error("Error in auth state listener:", error);
      }
    });
  }
}

// Export singleton instance
const authService = new AuthServiceClass();
export default authService;
