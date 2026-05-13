import { Injectable, Logger } from '@nestjs/common';
import { Intent } from '../enums/intent.enum';

export interface RecognizedIntent {
  intent: Intent;
  entities: {
    specialization?: string;
    doctorName?: string;
    date?: string;
    time?: string;
    userId?: string;
  };
  confidence: number;
  rawMessage: string;
}

@Injectable()
export class IntentRecognizerService {
  private readonly logger = new Logger(IntentRecognizerService.name);

  private readonly specializationKeywords: Record<string, string[]> = {
    skin: ['skin', 'dermat', 'dermatologist', 'acne', 'rash', 'eczema'],
    general: [
      'general',
      'fever',
      'cold',
      'flu',
      'gp',
      'physician',
      'regular',
      'checkup',
    ],
    cardiology: [
      'heart',
      'cardio',
      'cardiologist',
      'chest pain',
      'cardiac',
      'bp',
      'blood pressure',
    ],
    pediatrics: ['child', 'children', 'kids', 'baby', 'pediatric', 'paediatr'],
  };

  private readonly timeKeywords: Record<string, string[]> = {
    morning: ['morning', 'early', 'am'],
    evening: ['evening', 'after work', 'pm', 'late'],
    afternoon: ['afternoon', 'noon', 'lunch time'],
  };

  private readonly dateKeywords: Record<string, string[]> = {
    today: ['today', 'now', 'asap', 'this evening', 'tonight', 'this morning'],
    tomorrow: ['tomorrow', 'next day', 'tmrw', 'tmr'],
    weekend: ['weekend', 'saturday', 'sunday'],
  };

  recognize(message: string): RecognizedIntent {
    const normalized = message.toLowerCase().trim();
    this.logger.log(`Recognizing intent for: "${message}"`);

    const intent = this.detectIntent(normalized);
    const entities = this.extractEntities(normalized);
    const confidence = this.calculateConfidence(intent, entities);

    this.logger.log(
      `Intent detected: ${intent} | confidence: ${confidence} | entities: ${JSON.stringify(entities)}`,
    );

    return { intent, entities, confidence, rawMessage: message };
  }

  private detectIntent(message: string): Intent {
    const bookPatterns = [
      /book/i,
      /appointment/i,
      /schedule/i,
      /reserve/i,
      /i need (a |an )?(doctor|specialist|physician|slot)/i,
      /can (i|you) (get|have|book|schedule)/i,
      /available (slots?|timing|time)/i,
      /any slots?/i,
    ];

    const cancelPatterns = [
      /cancel/i,
      /cancell/i,
      /remove (my )?appointment/i,
      /don'?t (want|need) (the |my )?appointment/i,
      /call off/i,
    ];

    const viewPatterns = [
      /show/i,
      /view/i,
      /list/i,
      /my (appointment|booking)/i,
      /upcoming/i,
      /what (appointment|booking)/i,
      /do i have/i,
      /check (my )?appointment/i,
    ];

    const availabilityPatterns = [
      /available/i,
      /any slots?/i,
      /free (slot|time|timing)/i,
      /is (dr|doctor).*available/i,
      /when (is|can)/i,
      /slot available/i,
    ];

    if (cancelPatterns.some((p) => p.test(message)))
      return Intent.CANCEL_APPOINTMENT;
    if (viewPatterns.some((p) => p.test(message)))
      return Intent.VIEW_APPOINTMENTS;
    if (availabilityPatterns.some((p) => p.test(message)))
      return Intent.CHECK_AVAILABILITY;
    if (bookPatterns.some((p) => p.test(message)))
      return Intent.BOOK_APPOINTMENT;

    return Intent.UNKNOWN;
  }

  private extractEntities(message: string): RecognizedIntent['entities'] {
    const entities: RecognizedIntent['entities'] = {};

    // Extract specialization
    for (const [spec, keywords] of Object.entries(
      this.specializationKeywords,
    )) {
      if (keywords.some((kw) => message.includes(kw))) {
        entities.specialization = spec;
        break;
      }
    }

    // Extract doctor name
    const doctorMatch = message.match(/dr\.?\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (doctorMatch) {
      entities.doctorName = `Dr. ${doctorMatch[1].trim()}`;
    }

    // Extract date
    for (const [date, keywords] of Object.entries(this.dateKeywords)) {
      if (keywords.some((kw) => message.includes(kw))) {
        entities.date = date;
        break;
      }
    }

    // Extract specific date like "15th", "may 15"
    const specificDate = message.match(
      /(\d{1,2})(st|nd|rd|th)?(\s+of)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    );
    if (specificDate) {
      entities.date = specificDate[0];
    }

    // Extract time
    const specificTime = message.match(/\d{1,2}(:\d{2})?\s*(am|pm)/i);
    if (specificTime) {
      entities.time = specificTime[0];
    } else {
      for (const [period, keywords] of Object.entries(this.timeKeywords)) {
        if (keywords.some((kw) => message.includes(kw))) {
          entities.time = period;
          break;
        }
      }
    }

    return entities;
  }

  private calculateConfidence(
    intent: Intent,
    entities: RecognizedIntent['entities'],
  ): number {
    if (intent === Intent.UNKNOWN) return 0;

    let confidence = 0.6;
    if (entities.specialization) confidence += 0.1;
    if (entities.doctorName) confidence += 0.1;
    if (entities.date) confidence += 0.1;
    if (entities.time) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}
