import { useState, useRef } from 'react';
import './SearchBar.css';

export default function SearchBar({ placeholder = 'Search...', onSearch, autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onSearch?.(val);
  };

  const handleClear = () => {
    setQuery('');
    onSearch?.('');
    inputRef.current?.focus();
  };

  return (
    <div className={`search-bar ${focused ? 'focused' : ''}`}>
      <span className="search-icon">⌕</span>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        className="search-input"
        autoComplete="off"
        spellCheck="false"
      />
      {query && (
        <button className="search-clear" onClick={handleClear} aria-label="Clear search">
          ✕
        </button>
      )}
    </div>
  );
}
