import { createContext, useContext } from 'react';

const BusinessLayoutContext = createContext(null);

export function BusinessLayoutProvider({ value, children }) {
  return <BusinessLayoutContext.Provider value={value}>{children}</BusinessLayoutContext.Provider>;
}

export function useBusinessLayout() {
  const context = useContext(BusinessLayoutContext);
  if (!context) {
    throw new Error('useBusinessLayout must be used within BusinessLayoutProvider');
  }
  return context;
}
