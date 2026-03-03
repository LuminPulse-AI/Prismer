'use client';

/**
 * ButtonGroup
 *
 * Button group interactive component - Horizontal layout with horizontal scrolling
 */

import React, { memo } from 'react';
import type { ButtonGroupComponent, ButtonConfig } from '../../types';

interface ButtonGroupProps {
  config: ButtonGroupComponent;
  onAction: (buttonId: string) => void;
  disabled?: boolean;
}

const buttonVariants: Record<ButtonConfig['variant'], string> = {
  primary: 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-500/20',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20',
};

export const ButtonGroup = memo(function ButtonGroup({
  config,
  onAction,
  disabled = false,
}: ButtonGroupProps) {
  return (
    <div
      className="flex flex-row gap-2 items-center overflow-x-auto scrollbar-hide"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {config.buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          onClick={() => !disabled && !button.disabled && onAction(button.id)}
          disabled={disabled || button.disabled}
          className={`
            px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap flex-shrink-0
            transition-all duration-200
            flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
            active:scale-95
            ${buttonVariants[button.variant]}
          `}
        >
          {button.icon && <span className="text-base">{button.icon}</span>}
          {button.label}
        </button>
      ))}
    </div>
  );
});

export default ButtonGroup;
