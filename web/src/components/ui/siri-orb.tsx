"use client"

import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Settings } from "lucide-react";

// --- Minimal Button Component ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "candy" | "default"
  size?: "sm" | "md"
}
const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = "default",
  size = "md",
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
  const variants: Record<string, string> = {
    default:
      "bg-gray-200 text-black hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600",
    candy: "bg-pink-500 text-white hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-500",
  }
  const sizes: Record<string, string> = {
    sm: "px-2 py-1 text-sm",
    md: "px-4 py-2 text-base",
  }
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  )
}

// --- SiriOrb Component (uses transform animation for better browser compatibility) ---
interface SiriOrbProps {
  size?: string
  className?: string
  colors?: {
    bg?: string
    c1?: string
    c2?: string
    c3?: string
  }
  animationDuration?: number
}

const SiriOrb: React.FC<SiriOrbProps> = ({
  size = "192px",
  className,
  colors,
  animationDuration = 20,
}) => {
  const defaultColors = {
    bg: "transparent",
    c1: "#ec4899", // pink-500
    c2: "#8b5cf6", // violet-500
    c3: "#06b6d4", // cyan-500
  }

  const finalColors = { ...defaultColors, ...colors }
  const sizeValue = parseInt(size.replace("px", ""), 10)
  const blurAmount = Math.max(sizeValue * 0.1, 10)

  // Generate unique animation names to avoid conflicts
  const reverseSpinStyle = {
    animation: `siriOrbReverseSpin ${animationDuration * 0.7}s linear infinite reverse`,
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
      }}
    >
      {/* Global styles - Use dangerouslySetInnerHTML to avoid styled-jsx hydration issues */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes siriOrbReverseSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}} />
      
      {/* Background layer */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(0,0,0,0.05) 0%, transparent 70%)`,
        }}
      />
      
      {/* Animation layer 1 - Clockwise rotation (using Tailwind's animate-spin) */}
      <div
        className="absolute inset-0 rounded-full animate-spin"
        style={{
          animationDuration: `${animationDuration}s`,
          background: `
            conic-gradient(from 0deg at 30% 70%, ${finalColors.c1} 0deg, transparent 60deg, transparent 300deg, ${finalColors.c1} 360deg),
            conic-gradient(from 120deg at 70% 30%, ${finalColors.c2} 0deg, transparent 60deg, transparent 300deg, ${finalColors.c2} 360deg),
            conic-gradient(from 240deg at 50% 50%, ${finalColors.c3} 0deg, transparent 60deg, transparent 300deg, ${finalColors.c3} 360deg)
          `,
          filter: `blur(${blurAmount}px)`,
          opacity: 0.9,
        }}
      />
      
      {/* Animation layer 2 - Counter-clockwise rotation */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          ...reverseSpinStyle,
          background: `
            conic-gradient(from 60deg at 25% 25%, ${finalColors.c2} 0deg, transparent 45deg, transparent 315deg, ${finalColors.c2} 360deg),
            conic-gradient(from 180deg at 75% 75%, ${finalColors.c1} 0deg, transparent 45deg, transparent 315deg, ${finalColors.c1} 360deg)
          `,
          filter: `blur(${blurAmount * 1.2}px)`,
          opacity: 0.7,
        }}
      />
      
      {/* Animation layer 3 - Pulse effect */}
      <div
        className="absolute inset-0 rounded-full animate-pulse"
        style={{
          animationDuration: `${animationDuration * 0.3}s`,
          background: `
            radial-gradient(ellipse 80% 60% at 30% 40%, ${finalColors.c3}80 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 70% 60%, ${finalColors.c1}80 0%, transparent 50%)
          `,
          filter: `blur(${blurAmount * 0.8}px)`,
          opacity: 0.6,
        }}
      />
      
      {/* Highlight layer */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 40% 40%, rgba(255,255,255,0.15) 0%, transparent 50%)`,
        }}
      />
    </div>
  )
}

// --- Demo Wrapper ---
const SiriOrbDemo: React.FC = () => {
  const [selectedSize, setSelectedSize] = useState<string>("192px")
  const [animationDuration, setAnimationDuration] = useState(20)
  const [showSettings, setShowSettings] = useState(false)

  const sizeOptions = [
    { value: "64px", label: "XS" },
    { value: "128px", label: "SM" },
    { value: "192px", label: "MD" },
    { value: "256px", label: "LG" },
    { value: "320px", label: "XL" },
  ]

  return (
    <div className="min-h-screen min-w-screen bg-gradient-to-br from-white to-gray-100 dark:from-slate-900 dark:to-slate-700 flex items-center justify-center relative text-black dark:text-white">
      <SiriOrb
        size={selectedSize}
        animationDuration={animationDuration}
        className="drop-shadow-2xl"
      />

      <div className="absolute right-4 bottom-4">
        <Button
          variant="candy"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="h-10 w-10 rounded-full p-0"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {showSettings && (
        <div className="bg-white/90 dark:bg-black/40 backdrop-blur-md absolute right-4 bottom-[64px] flex w-fit flex-col justify-between gap-4 rounded-lg border border-black/10 dark:border-white/20 p-4 shadow-xl">
          <div>
            <div className="mb-2 block text-sm font-medium">Size</div>
            <div className="flex gap-2">
              {sizeOptions.map((option) => (
                <Button
                  variant="candy"
                  size="sm"
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedSize(option.value)}
                  className={`h-auto w-auto px-2 py-1 ${
                    selectedSize === option.value ? "" : "opacity-50"
                  }`}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="animation-speed"
              className="mb-2 block text-sm font-medium"
            >
              Animation Speed: {animationDuration}s
            </label>
            <input
              id="animation-speed"
              type="range"
              min="5"
              max="40"
              value={animationDuration}
              onChange={(e) => setAnimationDuration(Number(e.target.value))}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg border border-gray-300 dark:border-white/30 bg-gray-200 dark:bg-white/10"
            />
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: oklch(0.72 0.2 352.53);
          cursor: pointer;
          border: none;
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: oklch(0.72 0.2 352.53);
          cursor: pointer;
          border: none;
        }
      `}} />
    </div>
  )
}

export { SiriOrb }
export default SiriOrbDemo
