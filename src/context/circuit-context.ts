import { createContext, useContext } from "react";

export type CircuitContextType = {
  toggleInputValue: (id: string) => void;
};

export const CircuitContext = createContext<CircuitContextType | null>(null);

export function useCircuit() {
  const context = useContext(CircuitContext);
  if (!context) {
    throw new Error("useCircuit must be used within a CircuitProvider");
  }
  return context;
}
