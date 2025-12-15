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

interface StoredUser extends User {
  password?: string; // In a real app, this would be a hash
}

export const authService = {
  getUsers: (): StoredUser[] => {
    const usersJson = localStorage.getItem(USERS_KEY);
    return usersJson ? JSON.parse(usersJson) : [];
  },

  saveUsers: (users: StoredUser[]) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  register: async (name: string, email: string, password: string): Promise<User> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = authService.getUsers();
    if (users.find(u => u.email === email)) {
      throw new Error("User already exists with this email.");
    }

    const newUser: StoredUser = {
      id: `user-${Date.now()}`,
      name,
      email,
      password, // Storing simply for this mock
      preferences: { ...defaultPreferences }
    };

    users.push(newUser);
    authService.saveUsers(users);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    authService.setSession(userWithoutPassword);
    
    return userWithoutPassword;
  },

  login: async (email: string, password: string): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = authService.getUsers();
    const user = users.find(u => u.email === email);

    if (!user || user.password !== password) {
      throw new Error("Invalid email or password.");
    }

    const { password: _, ...userWithoutPassword } = user;
    authService.setSession(userWithoutPassword);
    return userWithoutPassword;
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