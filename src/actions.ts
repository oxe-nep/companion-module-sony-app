import { CompanionActionDefinition, CompanionActionDefinitions, CompanionActionEvent } from '@companion-module/base'
import { SonyAppInstance } from './index'

export function UpdateActions(instance: SonyAppInstance): void {
  const actions: CompanionActionDefinitions = {}

  // Create an array with all AUX options for dropdown
  const auxChoices: { id: string; label: string }[] = []
  
  // Get actual AUX list from the instance instead of assuming 48 AUX
  const auxList = instance.getAvailableAux()
  
  // Add available AUX to choices
  auxList.forEach(auxId => {
    const auxName = instance.getAuxName(auxId) || `AUX ${auxId.replace('aux', '')}`
    auxChoices.push({
      id: auxId,
      label: auxName
    })
  })
  
  // Action to set AUX source with dropdown for AUX selection
  actions.set_aux_source = {
    name: 'Set source on AUX',
    description: 'Select AUX and set source',
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices.map(choice => ({
          id: choice.id,
          label: choice.label
        }))
      },
      {
        type: 'dropdown',
        label: 'Source Type',
        id: 'sourceType',
        default: 'id',
        choices: [
          { id: 'id', label: 'Source ID' },
          { id: 'name', label: 'Source Name' }
        ]
      },
      {
        type: 'number',
        label: 'Source ID',
        id: 'sourceId',
        default: 1,
        min: 1,
        max: 1000,
        isVisible: (options) => options.sourceType === 'id'
      },
      {
        type: 'dropdown',
        label: 'Source Name',
        id: 'sourceName',
        default: '',
        choices: instance.getInputChoices(),
        isVisible: (options) => options.sourceType === 'name'
      }
    ],
    callback: async (action): Promise<void> => {
      const auxId = action.options.auxId as string
      
      if (action.options.sourceType === 'id') {
        const sourceId = action.options.sourceId as number
        await instance.setAuxSource(auxId, sourceId.toString())
      } else {
        // Find source ID based on name
        const sourceId = action.options.sourceName as string
        await instance.setAuxSource(auxId, sourceId)
      }
    }
  }

  // Action to connect to mixer
  actions.connect_mixer = {
    name: 'Connect to Sony Switcher',
    description: 'Action to trigger connection to Sony Switcher from backend',
    options: [],
    callback: async (action): Promise<void> => {
      instance.requestConnection();
    }
  };

  // Action to disconnect from mixer
  actions.disconnect_mixer = {
    name: 'Disconnect from Sony Switcher',
    description: 'Action to trigger disconnection from Sony Switcher from backend',
    options: [],
    callback: async (action): Promise<void> => {
      instance.requestDisconnection();
    }
  };

  instance.setActionDefinitions(actions)
} 