import { Image, StyleSheet, View } from 'react-native';

// 1x4 PNG: one 55%-black row, three transparent rows. Tiled over a captured
// image to keep the Noir look and cut the light the OLED emits.
const SCANLINE_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAECAYAAABP2FU6AAAAD0lEQVR42mNgYGDoYUAFAAjUAI3OeLg1AAAAAElFTkSuQmCC';

export function ScanlineOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <Image
        source={{ uri: SCANLINE_TILE }}
        style={StyleSheet.absoluteFill}
        resizeMode="repeat"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
});
