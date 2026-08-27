import { useState, useEffect } from 'react';

export default function InlineTimePicker({ value, disabled, onSave, className, title, style }) {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleBlur = () => {
    const trimmedLocal = localValue || '';
    const trimmedProp = value || '';
    if (trimmedLocal !== trimmedProp) {
      onSave(trimmedLocal);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <input
      type="time"
      className={className}
      value={localValue}
      disabled={disabled}
      title={title}
      style={style}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
