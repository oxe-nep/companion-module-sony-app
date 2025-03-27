import { SomeCompanionConfigField } from '@companion-module/base'

export function GetConfigFields(): SomeCompanionConfigField[] {
  return [
    {
      type: 'textinput',
      id: 'host',
      label: 'Server IP',
      width: 8,
      default: '127.0.0.1'
    },
    {
      type: 'number',
      id: 'port',
      label: 'Server Port',
      width: 4,
      default: 3000,
      min: 1,
      max: 65535
    }
  ]
} 