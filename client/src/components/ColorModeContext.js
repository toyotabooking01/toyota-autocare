import { createContext, useContext } from 'react'
export const ColorModeContext = createContext(null)
export const useColorMode = () => useContext(ColorModeContext)
