// components/ui/SelectField.tsx — full replacement
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT } from '@/constants/theme';

interface Option {
  label: string;
  value: string;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (val: string) => void;
  containerStyle?: any;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  containerStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {/* Label */}
      <Text style={styles.label}>{label}</Text>

      {/* Trigger button */}
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
        ]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {selected?.label ?? 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
      </Pressable>

      {/* Bottom sheet modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        {/* Dark overlay — tap to close */}
        <Pressable
          style={styles.overlay}
          onPress={() => setOpen(false)}
        />

        {/* Sheet container — NOT inside the overlay Pressable */}
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.sheetTitle}>{label}</Text>

          {/* Options list */}
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.scrollContent}
          >
            {options.map((item) => {
              const active = item.value === value;
              return (
                <Pressable
                  key={item.value}
                  style={({ pressed }) => [
                    styles.option,
                    active  && styles.optionActive,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      active && styles.optionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={COLORS.primary}
                    />
                  )}
                </Pressable>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export default SelectField;

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },

  label: {
    color: COLORS.textMuted,
    fontSize: FONT.xs,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  // ── Trigger
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.input,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerPressed: {
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  triggerText: {
    color: COLORS.text,
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },

  // ── Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  // ── Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '72%',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },

  sheetTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },

  scrollContent: {
    paddingBottom: 8,
  },

  // ── Option row
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    marginBottom: 2,
  },
  optionActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  optionPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionText: {
    color: COLORS.textSlate,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});