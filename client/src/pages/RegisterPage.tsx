// client/src/pages/RegisterPage.tsx
// Modern registration page with username availability checking

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import authService, { RegisterData } from '../services/authService';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState<RegisterData>({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<{
    isChecking: boolean;
    isAvailable: boolean | null;
    message: string;
  }>({
    isChecking: false,
    isAvailable: null,
    message: '',
  });

  // Check username availability with debounce
  useEffect(() => {
    const checkUsername = async () => {
      const username = formData.username.trim();
      
      if (username.length < 2) {
        setUsernameStatus({
          isChecking: false,
          isAvailable: null,
          message: username.length > 0 ? 'Username must be at least 2 characters' : '',
        });
        return;
      }

      if (username.length > 20) {
        setUsernameStatus({
          isChecking: false,
          isAvailable: false,
          message: 'Username must be 20 characters or less',
        });
        return;
      }

      // Check for valid characters
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        setUsernameStatus({
          isChecking: false,
          isAvailable: false,
          message: 'Username can only contain letters, numbers, and underscores',
        });
        return;
      }

      setUsernameStatus(prev => ({ ...prev, isChecking: true }));

      try {
        const isAvailable = await authService.checkUsernameAvailability(username);
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

    if (!formData.password) {
      return 'Password is required';
    }

    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters long';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return 'Please enter a valid email address';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      await authService.register(formData);
      
      // Redirect to home after successful registration
      navigate('/', { replace: true });
      
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getUsernameStatusColor = () => {
    if (usernameStatus.isChecking) return 'text-blue-400';
    if (usernameStatus.isAvailable === true) return 'text-green-400';
    if (usernameStatus.isAvailable === false) return 'text-red-400';
    return 'text-gray-400';
  };

  const getUsernameStatusIcon = () => {
    if (usernameStatus.isChecking) return '⏳';
    if (usernameStatus.isAvailable === true) return '✅';
    if (usernameStatus.isAvailable === false) return '❌';
    return '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg">
              🎯
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Join the Game!</h1>
            <p className="text-gray-400">Create your Imposter Word Game account</p>
          </div>
        </div>

        {/* Registration Form */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                Username *
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className={`w-full bg-white/10 border rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${
                    usernameStatus.isAvailable === true 
                      ? 'border-green-500/50 focus:ring-green-500' 
                      : usernameStatus.isAvailable === false 
                      ? 'border-red-500/50 focus:ring-red-500'
                      : 'border-white/20 focus:ring-primary-500'
                  }`}
                  placeholder="Choose a unique username"
                  autoComplete="username"
                  disabled={isLoading}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-lg">
                    {usernameStatus.isChecking ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      '👤'
                    )}
                  </span>
                </div>
              </div>
              {usernameStatus.message && (
                <p className={`text-sm mt-1 flex items-center space-x-1 ${getUsernameStatusColor()}`}>
                  <span>{getUsernameStatusIcon()}</span>
                  <span>{usernameStatus.message}</span>
                </p>
              )}
            </div>

            {/* Email Field (Optional) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email (Optional)
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                  placeholder="your@email.com"
                  autoComplete="email"
                  disabled={isLoading}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-lg">📧</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Optional, but helps with account recovery
              </p>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                  placeholder="Create a secure password"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  <span className="text-lg">{showPassword ? '🙈' : '👁️'}</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                At least 6 characters
              </p>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`w-full bg-white/10 border rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${
                    formData.confirmPassword && formData.password !== formData.confirmPassword
                      ? 'border-red-500/50 focus:ring-red-500'
                      : 'border-white/20 focus:ring-primary-500'
                  }`}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  <span className="text-lg">{showConfirmPassword ? '🙈' : '👁️'}</span>
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-sm mt-1 text-red-400 flex items-center space-x-1">
                  <span>❌</span>
                  <span>Passwords do not match</span>
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-200 text-sm">
                <div className="flex items-center space-x-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Register Button */}
            <button
              type="submit"
              disabled={isLoading || usernameStatus.isAvailable === false || usernameStatus.isChecking}
              className={`w-full font-semibold py-3 px-6 rounded-xl transition-all duration-200 ${
                isLoading || usernameStatus.isAvailable === false || usernameStatus.isChecking
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white hover:scale-105 hover:shadow-xl shadow-green-500/30'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating account...</span>
                </div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-8 text-center">
            <p className="text-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-primary-400 hover:text-primary-300 font-medium hover:underline transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center space-y-2">
          <Link
            to="/"
            className="text-gray-400 hover:text-white text-sm transition-colors inline-flex items-center space-x-1"
          >
            <span>←</span>
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;