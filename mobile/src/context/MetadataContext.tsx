import React, { createContext, useState, useContext, ReactNode } from 'react';

interface TrackMetadata {
    title: string;
    artist: string;
    artwork: string;
}

interface MetadataContextType {
    metadata: TrackMetadata | null;
    updateMetadata: (data: TrackMetadata) => void;
    clearMetadata: () => void;
}

const MetadataContext = createContext<MetadataContextType | undefined>(undefined);

export const MetadataProvider = ({ children }: { children: ReactNode }) => {
    const [metadata, setMetadata] = useState<TrackMetadata | null>(null);

    const updateMetadata = (data: TrackMetadata) => {
        setMetadata(data);
    };

    const clearMetadata = () => {
        setMetadata(null);
    };

    return (
        <MetadataContext.Provider value={{ metadata, updateMetadata, clearMetadata }}>
            {children}
        </MetadataContext.Provider>
    );
};

export const useMetadata = () => {
    const context = useContext(MetadataContext);
    if (!context) {
        throw new Error('useMetadata must be used within a MetadataProvider');
    }
    return context;
};

export default MetadataContext;
