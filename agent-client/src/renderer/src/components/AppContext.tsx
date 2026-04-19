import{ useContext, createContext, useState, ReactNode } from 'react'

interface AppContextType {
    isLoading: boolean
    setIsLoading: (isLoading: boolean) => void
}

const AppContext = createContext<AppContextType>({
    isLoading: false,
    setIsLoading: () => {}
})

export const useAppContext = () => useContext(AppContext)

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [isLoading, setIsLoading] = useState(false)

    return (
        <AppContext.Provider value={{ isLoading, setIsLoading }}>
            {children}
        </AppContext.Provider>
    )
}