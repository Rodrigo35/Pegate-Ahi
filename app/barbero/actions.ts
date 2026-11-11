'use server'

import { createClient } from '@/utils/supabase/server' // Ajusta la ruta a tu cliente de Supabase
import { revalidatePath } from 'next/cache'

export async function updateServicePrice(newPrice: number) {
  const supabase = createClient()

  const { error } = await supabase
    .from('service_settings')
    .update({ price: newPrice })
    .eq('service_name', 'Corte General')

  if (error) {
    console.error('Error al actualizar precio:', error)
    return { success: false }
  }

  revalidatePath('/barbero')
  revalidatePath('/cliente')
  return { success: true }
}
