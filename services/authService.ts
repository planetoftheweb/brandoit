import { User, UserPreferences } from "../types";
import { BRAND_COLORS, VISUAL_STYLES, GRAPHIC_TYPES, ASPECT_RATIOS } from "../constants";

const USERS_KEY = 'banana_brand_users';
const SESSION_KEY = 'banana_brand_session';

const defaultPreferences: UserPreferences = {
  brandColors: BRAND_COLORS,
  visualStyles: VISUAL_STYLES,
  graphicTypes: GRAPHIC_TYPES,
  aspectRatios: ASPECT_RATIOS
};

export const authService = {
  getUsers: (): User[] => {
    const usersJson = localStorage.getItem(USERS_KEY);
    return usersJson ? JSON.parse(usersJson) : [];
  },

  saveUsers: (users: User[]) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  register: async (name: string, email: string, password: string): Promise<User> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = authService.getUsers();
    if (users.find(u => u.email === email)) {
      throw new Error("User already exists with this email.");
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      name,
      email,
      preferences: { ...defaultPreferences }
    };

    // In a real app, we'd hash the password. storing it here separately or just mocking auth success
    // For this mock, we'll store the user object. We won't strictly check password on 'login' for simplicity
    // unless we want to store it. Let's store a "credentials" object in a separate key if we wanted to be robust,
    // but for this demo, we'll assume success if email matches.
    
    // Actually, let's just store the user.
    users.push(newUser);
    authService.saveUsers(users);
    authService.setSession(newUser);
    
    return newUser;
  },

  login: async (email: string, password: string): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = authService.getUsers();
    const user = users.find(u => u.email === email);

    // Mock password check (accept any password for demo purposes if user exists)
    if (!user) {
      throw new Error("Invalid email or password.");
    }

    authService.setSession(user);
    return user;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  setSession: (user: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  },

  getCurrentUser: (): User | null => {
    const sessionJson = localStorage.getItem(SESSION_KEY);
    return sessionJson ? JSON.parse(sessionJson) : null;
  },

  updateUserPreferences: (userId: string, preferences: UserPreferences) => {
    const users = authService.getUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index !== -1) {
      users[index].preferences = preferences;
      authService.saveUsers(users);
      
      // Update session if it's the current user
      const currentUser = authService.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        authService.setSession(users[index]);
      }
    }
  }
};