'use client'

import { useState } from 'react'

interface PriceEditorProps {
  initialPrice?: number
  onPriceChange?: (newPrice: number) => void
}

export default function PriceEditor({ initialPrice = 10, onPriceChange }: PriceEditorProps) {
  const [price, setPrice] = useState<number>(initialPrice)
  const [isEditing, setIsEditing] = useState<boolean>(false)

  const handleSave = () => {
    setIsEditing(false)
    if (onPriceChange) {
      onPriceChange(price)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white flex items-center justify-between">
      <div>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
          Precio del Corte
        </p>
        {isEditing ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xl font-bold text-emerald-400">$</span>
            <input
              type="number"
              step="0.50"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xl font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        ) : (
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            ${price.toFixed(2)}
          </p>
        )}
      </div>

      <div>
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
            >
              Guardar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
          >
            ✏️ Editar Precio
          </button>
        )}
      </div>
    </div>
  )
}
