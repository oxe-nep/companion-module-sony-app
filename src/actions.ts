import { CompanionActionDefinition, CompanionActionDefinitions, CompanionActionEvent } from '@companion-module/base'
import { SonyAppInstance } from './index'

export function UpdateActions(instance: SonyAppInstance): void {
  const actions: CompanionActionDefinitions = {}

  // Skapa en array med alla AUX-alternativ för dropdown
  const auxChoices: { id: string; label: string }[] = []
  
  // Lägg till AUX 1-48
  for (let i = 1; i <= 48; i++) {
    const auxId = `aux${i}`
    const auxName = instance.getAuxName(auxId) || `AUX ${i}`
    auxChoices.push({
      id: auxId,
      label: auxName
    })
  }

  // En enda action för att ställa in AUX-källa med dropdown för AUX-val
  actions.set_aux_source = {
    name: 'Set source on AUX',
    description: 'Select AUX and set source',
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices
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
        max: 24,
        isVisible: (options) => options.sourceType === 'id'
      },
      {
        type: 'textinput',
        label: 'Source Name',
        id: 'sourceName',
        default: '',
        isVisible: (options) => options.sourceType === 'name'
      }
    ],
    callback: async (action): Promise<void> => {
      const auxId = action.options.auxId as string
      
      if (action.options.sourceType === 'id') {
        const sourceId = action.options.sourceId as number
        await instance.setAuxSource(auxId, sourceId.toString())
      } else {
        // Hitta source ID baserat på namn
        const sourceName = action.options.sourceName as string
        const allInputs = instance.getAllInputs()
        
        // Sök efter namn eller anpassat namn
        const matchingInput = allInputs.find(input => 
          input.name === sourceName || 
          input.customName === sourceName
        )
        
        if (matchingInput) {
          await instance.setAuxSource(auxId, matchingInput.id)
        } else {
          instance.log('error', `Kan inte hitta källan med namn: ${sourceName}`)
        }
      }
    }
  }
  
  // Action för att växla flera källor till samma AUX
  actions.preset_source = {
    name: 'Preset Source to AUX',
    description: 'Set source on selected AUX',
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices
      },
      {
        type: 'dropdown',
        label: 'Source',
        id: 'sourceId',
        default: '1',
        choices: instance.getInputChoices()
      }
    ],
    callback: async (action): Promise<void> => {
      const auxId = action.options.auxId as string
      const sourceId = action.options.sourceId as string
      await instance.setAuxSource(auxId, sourceId)
    }
  }

  // Action för att ansluta till mixer
  actions.connect_mixer = {
    name: 'Connect to Sony Switcher',
    description: 'Action to trigger connection to Sony Switcher from backend',
    options: [],
    callback: async (action): Promise<void> => {
      instance.requestConnection();
    }
  };

  // Action för att koppla från mixer
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