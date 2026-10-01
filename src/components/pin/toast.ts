// Short confirmation / error toasts for the pin sheet.
import { toastController } from '@ionic/vue'

export async function showToast(message: string, color?: 'danger' | 'medium'): Promise<void> {
  const t = await toastController.create({ message, duration: 2500, position: 'bottom', color })
  await t.present()
}
