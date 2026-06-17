// components/ui/InputField.tsx — FINAL CORRECT FIX
import React, { useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { COLORS, RADIUS, FONT } from '@/constants/theme';

export interface InputFieldRef {
  getValue: () => string;
  clear: () => void;
  focus: () => void;
}

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  showPasswordToggle?: boolean;
  containerStyle?: any;
}

const InputField = forwardRef<InputFieldRef, Props>(function InputField(
  {
    label,
    defaultValue = '',
    onChangeText,
    showPasswordToggle,
    containerStyle,
    secureTextEntry,
    style,
    ...rest
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const valueRef = useRef<string>(defaultValue);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  // Expose getValue/clear/focus to parent via ref
  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    clear: () => {
      valueRef.current = '';
      inputRef.current?.clear();
    },
    focus: () => inputRef.current?.focus(),
  }));

  const handleChange = useCallback(
    (text: string) => {
      valueRef.current = text;
      onChangeText?.(text);
    },
    [onChangeText],
  );

  const toggleHide = useCallback(() => setHidden((h) => !h), []);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      {/* ✅ NO onFocus/onBlur handlers - let native focus work */}
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          defaultValue={defaultValue}
          onChangeText={handleChange}
          placeholderTextColor={COLORS.textFaint}
          secureTextEntry={showPasswordToggle ? hidden : secureTextEntry}
          autoCorrect={false}
          autoCapitalize="none"
          {...rest}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            onPress={toggleHide}
            style={styles.toggle}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.toggleText}>{hidden ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export { InputField };
export default InputField;

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.input,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 15,
  },
  toggle: {
    paddingLeft: 12,
    paddingVertical: 13,
  },
  toggleText: {
    color: COLORS.textFaint,
    fontSize: 13,
    fontWeight: '500',
  },
});