import React from 'react';
import {StyleSheet, View} from 'react-native';

const SparkAiLogo = ({size = 24}: {size?: number}) => {
  const nodeSize = Math.max(6, Math.round(size * 0.3));
  const rayLength = Math.max(5, Math.round(size * 0.34));

  return (
    <View style={[styles.root, {width: size, height: size, borderRadius: size / 2}]}>
      <View style={[styles.ray, styles.rayTop, {height: rayLength}]} />
      <View style={[styles.ray, styles.rayRight, {height: rayLength}]} />
      <View style={[styles.ray, styles.rayBottom, {height: rayLength}]} />
      <View style={[styles.ray, styles.rayLeft, {height: rayLength}]} />
      <View style={[styles.node, {width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2}]} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D3DFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  node: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  ray: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  rayTop: {top: 3},
  rayRight: {right: 5, transform: [{rotate: '45deg'}]},
  rayBottom: {bottom: 3},
  rayLeft: {left: 5, transform: [{rotate: '45deg'}]},
});

export default SparkAiLogo;
