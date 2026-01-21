import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RNCamera } from 'react-native-camera';
import api from '../../services/api';

export default function QRScannerScreen({ navigation }: any) {
    const onBarCodeRead = async (e: any) => {
        try {
            // e.data contains the QR code string, e.g., "DEVICE:CAFE-001"
            // Connect to device via API
            // const response = await api.post('/jukebox/connect', { device_code: e.data });
            // Navigate to Queue with session info

            console.log('QR Read:', e.data);
            navigation.replace('Queue', { deviceId: 'video-demo-id' });
        } catch (error) {
            console.error('Connection failed');
        }
    };

    return (
        <View style={styles.container}>
            <RNCamera
                style={styles.preview}
                type={RNCamera.Constants.Type.back}
                captureAudio={false}
                barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
                onBarCodeRead={onBarCodeRead}
            >
                <View style={styles.overlay}>
                    <Text style={styles.scanText}>QR Kodu Çerçevenin İçine Alın</Text>
                    <View style={styles.scanFrame} />
                </View>
            </RNCamera>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    preview: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    scanFrame: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: '#e91e63',
        backgroundColor: 'transparent',
    },
    scanText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
        fontWeight: 'bold',
    },
});
