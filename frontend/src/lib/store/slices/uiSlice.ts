import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  isEnabled: boolean;
  isComingSoon?: boolean;
}

interface UIState {
  isToolsMenuOpen: boolean;
  isProfileMenuOpen: boolean;
  isSidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  tools: Tool[];
}

const initialState: UIState = {
  isToolsMenuOpen: false,
  isProfileMenuOpen: false,
  isSidebarOpen: true,
  theme: 'system',
  tools: [
    {
      id: 'web-search',
      name: 'Web Search',
      description: 'Search the web for information',
      icon: 'web-search',
      isEnabled: true,
    },
    {
      id: 'code',
      name: 'Code Interpreter',
      description: 'Run and analyze code',
      icon: 'code',
      isEnabled: true,
    },
    {
      id: 'file-upload',
      name: 'File Upload',
      description: 'Upload and process files',
      icon: 'file-upload',
      isEnabled: true,
    },
    {
      id: 'image',
      name: 'Image Generation',
      description: 'Generate images from text',
      icon: 'image',
      isEnabled: false,
      isComingSoon: true,
    },
    {
      id: 'bot',
      name: 'Custom Agents',
      description: 'Create specialized AI agents',
      icon: 'bot',
      isEnabled: false,
      isComingSoon: true,
    },
  ],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleToolsMenu: (state) => {
      state.isToolsMenuOpen = !state.isToolsMenuOpen;
      // Close other menus when opening tools
      if (state.isToolsMenuOpen) {
        state.isProfileMenuOpen = false;
      }
    },
    setToolsMenuOpen: (state, action: PayloadAction<boolean>) => {
      state.isToolsMenuOpen = action.payload;
      // Close other menus when opening tools
      if (state.isToolsMenuOpen) {
        state.isProfileMenuOpen = false;
      }
    },
    toggleProfileMenu: (state) => {
      state.isProfileMenuOpen = !state.isProfileMenuOpen;
      // Close other menus when opening profile
      if (state.isProfileMenuOpen) {
        state.isToolsMenuOpen = false;
      }
    },
    setProfileMenuOpen: (state, action: PayloadAction<boolean>) => {
      state.isProfileMenuOpen = action.payload;
      // Close other menus when opening profile
      if (state.isProfileMenuOpen) {
        state.isToolsMenuOpen = false;
      }
    },
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
      state.theme = action.payload;
    },
    toggleTool: (state, action: PayloadAction<string>) => {
      const tool = state.tools.find(t => t.id === action.payload);
      if (tool && !tool.isComingSoon) {
        tool.isEnabled = !tool.isEnabled;
      }
    },
    updateTool: (state, action: PayloadAction<Partial<Tool> & { id: string }>) => {
      const index = state.tools.findIndex(t => t.id === action.payload.id);
      if (index !== -1) {
        state.tools[index] = { ...state.tools[index], ...action.payload };
      }
    },
  },
});

export const {
  toggleToolsMenu,
  setToolsMenuOpen,
  toggleProfileMenu,
  setProfileMenuOpen,
  toggleSidebar,
  setSidebarOpen,
  setTheme,
  toggleTool,
  updateTool,
} = uiSlice.actions;

export default uiSlice.reducer; 