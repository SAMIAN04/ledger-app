// components/ui/DatePickerField.tsx — modern dd/mm/yyyy date picker
import React, { useState, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Pressable, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT, SHADOW } from '@/constants/theme';

interface Props {
  label: string;
  value: string;           // stored as YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  disablePast?: boolean;   // for due dates: block past dates
  containerStyle?: any;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function parseDate(val: string) {
  if (!val) return null;
  const [y, m, d] = val.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplay(val: string) {
  if (!val) return '';
  const d = parseDate(val);
  if (!d) return val;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function DatePickerField({ label, value, onChange, placeholder, disablePast, containerStyle }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const initial = parseDate(value) || today;
  const [selDay,   setSelDay]   = useState(initial.getDate());
  const [selMonth, setSelMonth] = useState(initial.getMonth());
  const [selYear,  setSelYear]  = useState(initial.getFullYear());
  const [open, setOpen] = useState(false);

  const slideY  = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  function openPicker() {
    // Reset to current value or today
    const d = parseDate(value) || today;
    setSelDay(d.getDate()); setSelMonth(d.getMonth()); setSelYear(d.getFullYear());
    setOpen(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideY,  { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }

  function closePicker(save: boolean) {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 400, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
      if (save) {
        const maxDay = daysInMonth(selMonth, selYear);
        const day = Math.min(selDay, maxDay);
        const mm  = String(selMonth + 1).padStart(2, '0');
        const dd  = String(day).padStart(2, '0');
        onChange(`${selYear}-${mm}-${dd}`);
      }
    });
  }

  // Check if a given date is in the past (for disablePast)
  function isPastDate(day: number, month: number, year: number) {
    if (!disablePast) return false;
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }

  const maxDay = daysInMonth(selMonth, selYear);
  const days   = Array.from({ length: maxDay }, (_, i) => i + 1);
  const months = MONTHS.map((m, i) => ({ label: m, index: i }));
  const currentYear = today.getFullYear();
  // Years: allow going 100 years back (for regular dates), or only future years for disablePast
  const yearStart = disablePast ? currentYear : currentYear - 100;
  const years  = Array.from({ length: disablePast ? 30 : 130 }, (_, i) => yearStart + i);

  const ITEM_H = 44;

  function ScrollPicker({ items, selected, onSelect, disabled }: {
    items: number[]; selected: number; onSelect: (v: number) => void; disabled?: (v: number) => boolean;
  }) {
    const ref = useRef<FlatList>(null);
    const idx = items.indexOf(selected);

    return (
      <View style={sp.wrap}>
        {/* highlight bar */}
        <View style={sp.highlight} pointerEvents="none" />
        <FlatList
          ref={ref}
          data={items}
          keyExtractor={v => String(v)}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
          initialScrollIndex={Math.max(0, idx)}
          getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
            const val = items[Math.max(0, Math.min(idx, items.length - 1))];
            if (!disabled?.(val)) onSelect(val);
          }}
          renderItem={({ item }) => {
            const isSelected = item === selected;
            const isDisabled = disabled?.(item);
            return (
              <TouchableOpacity
                style={[sp.item, isSelected && sp.itemSelected]}
                onPress={() => { if (!isDisabled) onSelect(item); }}
                activeOpacity={0.7}
              >
                <Text style={[sp.itemText, isSelected && sp.itemTextSelected, isDisabled && sp.itemDisabled]}>
                  {String(item).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  function MonthPicker() {
    const ref = useRef<FlatList>(null);
    return (
      <View style={[sp.wrap, { flex: 2 }]}>
        <View style={sp.highlight} pointerEvents="none" />
        <FlatList
          ref={ref}
          data={months}
          keyExtractor={m => String(m.index)}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
          initialScrollIndex={Math.max(0, selMonth)}
          getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
            setSelMonth(Math.max(0, Math.min(i, 11)));
          }}
          renderItem={({ item }) => {
            const isSelected = item.index === selMonth;
            return (
              <TouchableOpacity style={[sp.item, isSelected && sp.itemSelected]} onPress={() => setSelMonth(item.index)} activeOpacity={0.7}>
                <Text style={[sp.itemText, isSelected && sp.itemTextSelected]} numberOfLines={1}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <TouchableOpacity onPress={openPicker} activeOpacity={0.8} style={styles.trigger}>
        {value ? (
          <Text style={styles.triggerText}>{formatDisplay(value)}</Text>
        ) : (
          <Text style={styles.triggerPlaceholder}>{placeholder || 'Select date'}</Text>
        )}
        <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => closePicker(false)}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closePicker(false)} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => closePicker(false)} style={styles.sheetBtn}>
              <Text style={styles.sheetBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>📅 {label}</Text>
            <TouchableOpacity onPress={() => closePicker(true)} style={styles.sheetBtn}>
              <Text style={[styles.sheetBtnText, { color: COLORS.primary, fontWeight: '700' }]}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Labels */}
          <View style={styles.colLabels}>
            <Text style={[styles.colLabel, { flex: 1 }]}>Day</Text>
            <Text style={[styles.colLabel, { flex: 2 }]}>Month</Text>
            <Text style={[styles.colLabel, { flex: 1.2 }]}>Year</Text>
          </View>

          {/* Pickers */}
          <View style={styles.pickerRow}>
            <ScrollPicker
              items={days}
              selected={selDay}
              onSelect={setSelDay}
              disabled={d => isPastDate(d, selMonth, selYear)}
            />
            <MonthPicker />
            <ScrollPicker
              items={years}
              selected={selYear}
              onSelect={setSelYear}
            />
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            <Text style={styles.previewText}>
              {String(Math.min(selDay, daysInMonth(selMonth, selYear))).padStart(2, '0')} / {String(selMonth + 1).padStart(2, '0')} / {selYear}
            </Text>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const sp = StyleSheet.create({
  wrap: {
    flex: 1,
    height: 44 * 5,
    overflow: 'hidden',
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: '50%',
    left: 4,
    right: 4,
    height: 44,
    marginTop: -22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    zIndex: 1,
  },
  item: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  itemSelected: {},
  itemText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  itemTextSelected: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  itemDisabled: {
    color: 'rgba(100,116,139,0.35)',
  },
});

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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.input,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerText: { color: COLORS.text, fontSize: 15 },
  triggerPlaceholder: { color: COLORS.textFaint, fontSize: 15 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    ...SHADOW.sheet,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sheetBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  sheetBtnText: { color: COLORS.textSlate, fontSize: 15 },
  colLabels: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 2,
  },
  colLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 4,
  },
  preview: {
    alignItems: 'center',
    paddingTop: 12,
  },
  previewText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});