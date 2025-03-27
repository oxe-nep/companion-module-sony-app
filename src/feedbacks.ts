import { CompanionFeedbackDefinition, CompanionFeedbackDefinitions, CompanionFeedbackBooleanEvent, CompanionFeedbackContext } from '@companion-module/base'
import { SonyAppInstance } from './index'

export function GetFeedbacks(): CompanionFeedbackDefinition[] {
  return []
}

export function UpdateFeedbacks(instance: SonyAppInstance): void {
  const feedbacks: CompanionFeedbackDefinitions = {}

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

  // Feedback för att visa när en specifik källa är på en vald AUX
  feedbacks.aux_source_active = {
    type: 'boolean',
    name: 'Source on AUX',
    description: 'True when the selected source is active on the selected AUX',
    defaultStyle: {
      bgcolor: 0xff0000,
      color: 0x000000
    },
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
        type: 'dropdown',
        label: 'Source',
        id: 'sourceName',
        default: '1',
        choices: instance.getInputChoices(),
        isVisible: (options) => options.sourceType === 'name'
      }
    ],
    callback: (feedback): boolean => {
      const auxId = feedback.options.auxId as string
      const status = instance.getAuxStatus(auxId)
      
      // Om vi inte har någon status för denna AUX, returnera false
      if (!status) return false
      
      // Jämför beroende på vilken typ av källa som valts
      if (feedback.options.sourceType === 'id') {
        const sourceId = feedback.options.sourceId as number
        return status.sourceId === sourceId
      } else {
        const selectedSourceId = feedback.options.sourceName as string
        return status.sourceId.toString() === selectedSourceId
      }
    }
  }
  
  // Feedback för specifik AUX (visar namnet på aktiv källa)
  feedbacks.aux_source_name = {
    type: 'advanced',
    name: 'Name of active source on AUX',
    description: 'Show the name of the active source for a selected AUX',
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices
      }
    ],
    callback: (feedback): { text: string } | undefined => {
      const auxId = feedback.options.auxId as string
      const status = instance.getAuxStatus(auxId)
      
      // Om vi inte har någon status för denna AUX, returnera undefined
      if (!status) return undefined
      
      // Använd anpassat namn om det finns, annars använd originellt namn
      const sourceName = status.customSourceName || status.sourceName || `Input ${status.sourceId}`
      
      return {
        text: sourceName
      }
    }
  }

  // Feedback för mixeranslutning
  feedbacks.mixer_connection = {
    type: 'boolean',
    name: 'Switcher Connection Status',
    description: 'Returns true when Sony Switcher is connected to backend',
    defaultStyle: {
      bgcolor: 0x00ff00,
      color: 0x000000
    },
    options: [],
    callback: (feedback): boolean => {
      return instance.getMixerConnectionStatus();
    }
  }

  instance.setFeedbackDefinitions(feedbacks)
} 