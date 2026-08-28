import { Theme } from '@radix-ui/themes'
import { ChevronDownIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  type DropdownIndicatorProps,
  MenuProps,
  type StylesConfig,
  components,
} from 'react-select'
import CreatableSelect from 'react-select/creatable'

import { getThemeConfig } from './StyledReactSelect/StyledReactSelect.styles'

type ComboBoxOption = {
  label: string
  value: string
}

interface ComboBoxProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  options: ComboBoxOption[]
  disabled?: boolean
  name?: string
  id?: string
  onBlur?: () => void
  /**
   * A modal dialog makes everything outside it inert, so a menu portalled to
   * the body there can be seen but not clicked. Turn it off inside one.
   */
  portalMenu?: boolean
}

export function ComboBox({
  value,
  placeholder,
  options,
  disabled,
  name,
  id,
  onChange,
  onBlur,
  portalMenu = true,
}: ComboBoxProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  // react-select picks an option on mousedown and blurs right after, both
  // before React re-renders, so blur has to read the pending text from a ref
  // instead of the state it captured on the last render.
  const pendingInput = useRef('')

  function setPendingInput(nextValue: string) {
    pendingInput.current = nextValue
    setInputValue(nextValue)
  }

  const selectedValue = value
    ? {
        value,
        label: value,
      }
    : null

  return (
    <CreatableSelect<ComboBoxOption, false>
      inputId={id}
      name={name}
      placeholder={placeholder}
      isDisabled={disabled}
      menuPlacement="auto"
      menuPosition="fixed"
      menuIsOpen={menuOpen}
      options={options}
      value={selectedValue}
      inputValue={inputValue}
      onFocus={() => !disabled && setMenuOpen(true)}
      onBlur={() => {
        setMenuOpen(false)

        // ponytail: react-select keeps text typed but never confirmed with
        // Enter or the "Use ..." option in its input only, so leaving the field
        // and submitting used to silently keep the previous value.
        const typed = pendingInput.current.trim()

        setPendingInput('')

        if (typed && typed !== value) {
          onChange(typed)
        }

        onBlur?.()
      }}
      onMenuOpen={() => setMenuOpen(true)}
      onMenuClose={() => setMenuOpen(false)}
      onInputChange={(nextValue, actionMeta) => {
        // Every action is honoured, not just typing: react-select clears the
        // input by passing '' here after a value is picked, and ignoring that
        // would leave stale text for the blur above to commit.
        setPendingInput(nextValue)

        if (actionMeta.action === 'input-change' && !menuOpen) {
          setMenuOpen(true)
        }

        return nextValue
      }}
      onChange={(option) => {
        setPendingInput('')
        onChange(option?.value ?? '')
      }}
      onCreateOption={(nextValue) => {
        onChange(nextValue)
        setPendingInput('')
        setMenuOpen(false)
      }}
      formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
      styles={getStylesConfig()}
      theme={getThemeConfig}
      components={{
        IndicatorSeparator: null,
        DropdownIndicator,
        Menu,
      }}
      menuPortalTarget={portalMenu ? document.body : undefined}
    />
  )
}

function Menu({ ...props }: MenuProps<ComboBoxOption>) {
  return (
    <Theme appearance="inherit">
      <components.Menu {...props} />
    </Theme>
  )
}

function DropdownIndicator(props: DropdownIndicatorProps<ComboBoxOption>) {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDownIcon />
    </components.DropdownIndicator>
  )
}

function getStylesConfig<Option>(): StylesConfig<Option> {
  return {
    control: (provided, state) => ({
      ...provided,
      height: 'var(--space-5)',
      minHeight: 'auto',
      fontSize: 'var(--font-size-1)',
      boxShadow: state.menuIsOpen ? 'none' : provided.boxShadow,
      borderColor: state.menuIsOpen ? 'var(--gray-a8)' : provided.borderColor,
      '&:hover': {
        borderColor: 'var(--gray-a8)',
      },
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: 0,
      paddingLeft: 'var(--space-1)',
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: 'var(--color-panel-solid)',
      fontSize: 'var(--font-size-1)',
    }),
    menuList: (provided) => ({
      ...provided,
      padding: 'var(--space-1)',
      borderRadius: 'var(--radius-2)',
    }),
    option: (provided, state) => ({
      ...provided,
      background: state.isFocused ? 'var(--accent-9)' : 'transparent',
      color: state.isFocused ? 'var(--accent-contrast)' : undefined,
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      paddingLeft: 'var(--space-4)',
      paddingRight: 'var(--space-4)',
      borderRadius: 'var(--radius-2)',
    }),
  }
}
