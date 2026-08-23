import {
  Baby,
  Beer,
  Bike,
  BookOpen,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Package,
  PawPrint,
  Pill,
  Plane,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tv,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  Droplets,
  Ticket,
  type LucideIcon,
} from 'lucide-react'

export const defaultCategoryIcons: Record<string, LucideIcon> = {
  Alimentação: ShoppingCart,
  Moradia: House,
  Transporte: Car,
  Saúde: HeartPulse,
  Lazer: Gamepad2,
  Educação: GraduationCap,
  Assinaturas: Tv,
  Outros: Package,
}

export const iconPack: Array<{ name: string; icon: LucideIcon; label: string }> = [
  { name: 'ShoppingCart', icon: ShoppingCart, label: 'Mercado' },
  { name: 'Utensils', icon: Utensils, label: 'Alimentação' },
  { name: 'House', icon: House, label: 'Moradia' },
  { name: 'Car', icon: Car, label: 'Carro' },
  { name: 'Fuel', icon: Fuel, label: 'Combustível' },
  { name: 'Bus', icon: Bus, label: 'Ônibus' },
  { name: 'Bike', icon: Bike, label: 'Bike' },
  { name: 'HeartPulse', icon: HeartPulse, label: 'Saúde' },
  { name: 'Pill', icon: Pill, label: 'Farmácia' },
  { name: 'GraduationCap', icon: GraduationCap, label: 'Educação' },
  { name: 'BookOpen', icon: BookOpen, label: 'Estudos' },
  { name: 'Tv', icon: Tv, label: 'Streaming' },
  { name: 'Smartphone', icon: Smartphone, label: 'Celular' },
  { name: 'Zap', icon: Zap, label: 'Energia' },
  { name: 'Droplets', icon: Droplets, label: 'Água' },
  { name: 'Gamepad2', icon: Gamepad2, label: 'Lazer' },
  { name: 'Ticket', icon: Ticket, label: 'Ingressos' },
  { name: 'Plane', icon: Plane, label: 'Viagem' },
  { name: 'Dumbbell', icon: Dumbbell, label: 'Academia' },
  { name: 'PawPrint', icon: PawPrint, label: 'Pets' },
  { name: 'Baby', icon: Baby, label: 'Crianças' },
  { name: 'Shirt', icon: Shirt, label: 'Roupas' },
  { name: 'Gift', icon: Gift, label: 'Presentes' },
  { name: 'Wrench', icon: Wrench, label: 'Manutenção' },
  { name: 'Package', icon: Package, label: 'Outros' },
  { name: 'Wallet', icon: Wallet, label: 'Finanças' },
  { name: 'Coffee', icon: Coffee, label: 'Café' },
  { name: 'Beer', icon: Beer, label: 'Bar' },
]

export const iconByName: Record<string, LucideIcon> = Object.fromEntries(
  iconPack.map(p => [p.name, p.icon])
) as Record<string, LucideIcon>

export function getCategoryIcon(category: string, customIcons?: Record<string, string>): LucideIcon {
  const custom = customIcons?.[category]
  if (custom && iconByName[custom]) return iconByName[custom]
  if (defaultCategoryIcons[category]) return defaultCategoryIcons[category]
  // fallback: tenta por texto
  const lower = category.toLowerCase()
  if (/pet|animal|cachorro|gato/.test(lower) && iconByName['PawPrint']) return iconByName['PawPrint']
  if (/crian|bebê|bebe|filho/.test(lower)) return iconByName['Baby'] ?? Package
  return Package
}
