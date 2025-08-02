// client/src/pages/RegisterPage.tsx
// ENHANCED VERSION - Better error handling and validation

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import authService from '../services/authService';

interface FormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface UsernameStatus {
  isChecking: boolean;
  isAvailable: boolean | null;
  message: string;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState<FormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({
    isChecking: false,
    isAvailable: null,
    message: '',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Username availability check with debouncing
  useEffect(() => {
    if (formData.username.length < 2) {
      setUsernameStatus({
        isChecking: false,
        isAvailable: null,
        message: '',
      });
      return;
    }

    const checkUsername = async () => {
      setUsernameStatus(prev => ({ ...prev, isChecking: true }));
      
      try {
        const isAvailable = await authService.checkUsernameAvailability(formData.username);
        setUsernameStatus({
          isChecking: false,
          isAvailable,
          message: isAvailable ? 'Username is available!' : 'Username is already taken',
        });
      } catch (error) {
        setUsernameStatus({
          isChecking: false,
          isAvailable: null,
          message: 'Could not check username availability',
        });
      }
    };

    const timeoutId = setTimeout(checkUsername, 500); // Debounce for 500ms
    return () => clearTimeout(timeoutId);
  }, [formData.username]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  const validateForm = (): string | null => {
    // Username validation
    if (!formData.username.trim()) {
      return 'Username is required';
    }

    if (formData.username.length < 2 || formData.username.length > 20) {
      return 'Username must be 2-20 characters long';
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }

    if (usernameStatus.isAvailable === false) {
      return 'Please choose a different username';
    }

    // Password validation
    if (!formData.password) {
      return 'Password is required';
    }

    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters long';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      return 'Please confirm your password';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    // Email validation (optional)
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return 'Please enter a valid email address';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      console.log('🚀 Submitting registration:', {
        username: formData.username,
        email: formData.email,
        hasPassword: !!formData.password,
        hasConfirmPassword: !!formData.confirmPassword,
      });

      // ✅ ENHANCED: Call authService register with complete form data
      await authService.register(formData);
      
      console.log('✅ Registration successful');
      
      // Redirect to home after successful registration
      navigate('/', { replace: true });
      
    } catch (error: any) {
      console.error('❌ Registration error:', error);
      
      // Extract error message
      let errorMessage = 'Registration failed. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-game-accent/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">🎭</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join the Game!</h1>
          <p className="text-gray-400">Create your Imposter Word Game account</p>
        </div>

        {/* Registration Form */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl">
              <div className="flex items-center space-x-2">
                <span className="text-red-400">⚠️</span>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-white text-sm font-medium mb-2">
                Username *
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Enter your username"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                  maxLength={20}
                  disabled={isLoading}
                  autoComplete="username"
                />
                {/* Username Status Indicator */}
                {formData.username.length >= 2 && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {usernameStatus.isChecking ? (
                      <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : usernameStatus.isAvailable === true ? (
                      <span className="text-green-400 text-xl">✓</span>
                    ) : usernameStatus.isAvailable === false ? (
                      <span className="text-red-400 text-xl">✗</span>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Username Status Message */}
              {usernameStatus.message && formData.username.length >= 2 && (
                <p className={`text-xs mt-1 ${
                  usernameStatus.isAvailable === true 
                    ? 'text-green-400' 
                    : usernameStatus.isAvailable === false 
                      ? 'text-red-400' 
                      : 'text-gray-400'
                }`}>
                  {usernameStatus.isChecking ? '⏳ Checking availability...' : `✅ ${usernameStatus.message}`}
                </p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-white text-sm font-medium mb-2">
                Email (Optional)
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                  disabled={isLoading}
                  autoComplete="email"
                />
                {formData.email && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <span className="text-blue-400 text-xl">📧</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Optional, but helps with account recovery</p>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-white text-sm font-medium mb-2">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Create a password"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 pr-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200"
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">At least 6 characters</p>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-white text-sm font-medium mb-2">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 pr-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Password Match Indicator */}
              {formData.confirmPassword && (
                <p className={`text-xs mt-1 ${
                  formData.password === formData.confirmPassword 
                    ? 'text-green-400' 
                    : 'text-red-400'
                }`}>
                  {formData.password === formData.confirmPassword 
                    ? '✅ Passwords match' 
                    : '⚠️ Passwords do not match'
                  }
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || usernameStatus.isAvailable === false}
              className={`w-full py-4 px-6 rounded-2xl font-bold text-white text-lg transition-all duration-300 transform ${
                isLoading || usernameStatus.isAvailable === false
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 hover:scale-105 hover:shadow-2xl shadow-primary-500/30'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-3">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating Account...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center space-x-3">
                  <span className="text-2xl">🚀</span>
                  <span>Create Account</span>
                </span>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Already have an account?{' '}
              <Link 
                to="/login" 
                className="text-primary-400 hover:text-primary-300 font-medium transition-colors duration-200"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-gray-400 hover:text-white transition-colors duration-200 text-sm"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;