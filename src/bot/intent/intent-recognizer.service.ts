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

  // ── Specialization keywords + common typos ───────────────────────────────
  private readonly specializationKeywords: Record<string, string[]> = {
    skin: [
      'skin',
      'skinn',
      'skn',
      'dermat',
      'dermatologist',
      'dermatologst',
      'dermatoligist',
      'dermatologyst',
      'dermtologist',
      'acne',
      'rash',
      'eczema',
      'psoriasis',
    ],
    general: [
      'general',
      'generl',
      'genral',
      'genearl',
      'generall',
      'fever',
      'fevr',
      'fver',
      'cold',
      'flu',
      'gp',
      'physician',
      'physicain',
      'physican',
      'regular',
      'checkup',
      'check up',
      'check-up',
      'routine',
      'common cold',
    ],
    cardiology: [
      'heart',
      'cardio',
      'cardiologist',
      'cardiologst',
      'cardiolgy',
      'cardiologyst',
      'cardioligist',
      'cardiologit',
      'chest pain',
      'chest ache',
      'cardiac',
      'bp',
      'blood pressure',
      'heartbeat',
      'palpitation',
      'palpitations',
    ],
    pediatrics: [
      'child',
      'children',
      'kids',
      'kid',
      'baby',
      'infant',
      'toddler',
      'pediatric',
      'paediatric',
      'paediatr',
      'pediatr',
      'peditrician',
      'pediatrician',
      'paediatrician',
      'pedatrician',
      'paedrician',
      'peditrican',
    ],
  };

  // ── Time period keywords + common typos ──────────────────────────────────
  private readonly timeKeywords: Record<string, string[]> = {
    morning: [
      'morning',
      'moring',
      'morming',
      'mornng',
      'mornig',
      'early',
      'am',
    ],
    afternoon: [
      'afternoon',
      'afternooon',
      'aftrnoon',
      'aftenoon',
      'afternon',
      'afernoon',
      'noon',
      'lunch time',
      'midday',
      'mid day',
    ],
    evening: [
      'evening',
      'evning',
      'evenin',
      'eveing',
      'evenng',
      'after work',
      'pm',
      'late',
      'night',
    ],
  };

  // ── Date keywords + common typos ─────────────────────────────────────────
  private readonly dateKeywords: Record<string, string[]> = {
    today: [
      'today',
      'toady',
      'tday',
      'todat',
      'todya',
      'now',
      'asap',
      'this evening',
      'tonight',
      'this morning',
    ],
    tomorrow: [
      'tomorrow',
      'tomorow',
      'tomrrow',
      'tomoro',
      'tommorow',
      'tommorrow',
      'tmmrw',
      'tmrw',
      'tmr',
      'next day',
    ],
    monday: ['monday', 'munday', 'mondy', 'mondey', 'mon'],
    tuesday: ['tuesday', 'tusday', 'tuseday', 'teusday', 'tue', 'tues'],
    wednesday: [
      'wednesday',
      'wendsday',
      'wednessday',
      'wendnesday',
      'wednseday',
      'wed',
    ],
    thursday: ['thursday', 'thurday', 'thurdsay', 'thrusday', 'thu', 'thurs'],
    friday: ['friday', 'firday', 'fridey', 'fridy', 'fri'],
    saturday: ['saturday', 'satuday', 'saturdey', 'saturady', 'sat'],
    sunday: ['sunday', 'sundey', 'sundy', 'sunday', 'sun'],
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
    const cancelPatterns = [
      /cancell?/i,
      /cancl\b/i,
      /canel\b/i,
      /cacnel\b/i,
      /remove (my )?appointment/i,
      /don'?t (want|need) (the |my )?appointment/i,
      /call off/i,
      /drop (my |the )?appointment/i,
      /delete (my |the )?appointment/i,
      /abort (my |the )?appointment/i,
      /stop (my |the )?appointment/i,
    ];

    const viewPatterns = [
      /\bshow\b/i,
      /\bview\b/i,
      /\blist\b/i,
      /my (appointment|booking)s?/i,
      /\bupcoming\b/i,
      /what (appointment|booking)/i,
      /do i have/i,
      /check (my )?appointment/i,
      /see (my )?(appointment|booking)/i,
      /get (my )?(appointment|booking)s?/i,
    ];

    const availabilityPatterns = [
      /free (slot|time|timing)/i,
      /is (dr\.?|doctor)[\w\s]+(available|free|open)/i,
      /when (is|can)/i,
      /slots? available/i,
      /any (available )?(slot|timing|time)/i,
      /available slot/i,
      /check (slot|availability|timing)/i,
      /what (slot|time)s? (is|are) available/i,
    ];

    const bookPatterns = [
      /\bbook\b/i,
      /\bschedule\b/i,
      /\breserve\b/i,
      // Guard: "appointment" must not fire when "cancel" precedes it
      /(?<!cancel[^.]{0,30})appointment/i,
      /i need (a |an )?\w*\s*(doctor|specialist|physician|slot)/i,
      /i need/i,
      /i want (a |an )?(doctor|specialist|appointment)/i,
      /can (i|you) (get|have|book|schedule)/i,
      /looking for (a |an )?(doctor|specialist)/i,
      /fix (me )?(a |an )?appointment/i,
      /set up (a |an )?appointment/i,
      /get me (a |an )?(appointment|slot|doctor)/i,
    ];

    // Priority: cancel → view → availability → book
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

    // ── Specialization ───────────────────────────────────────────────────────
    for (const [spec, keywords] of Object.entries(
      this.specializationKeywords,
    )) {
      if (keywords.some((kw) => message.includes(kw))) {
        entities.specialization = spec;
        break;
      }
    }

    // ── Doctor name — "Dr. Rajesh", "Dr Rajesh Kumar", etc. ─────────────────
    const doctorMatch = message.match(
      /dr\.?\s+([a-z]+(?:\s+(?!available|free|open|on|for|at|today|tomorrow|this|next|and|is|are|was|the)\b[a-z]+)?)/i,
    );
    if (doctorMatch) {
      entities.doctorName = `Dr. ${doctorMatch[1].trim()}`;
    }

    // ── Date ─────────────────────────────────────────────────────────────────
    for (const [date, keywords] of Object.entries(this.dateKeywords)) {
      if (keywords.some((kw) => message.includes(kw))) {
        entities.date = date;
        break;
      }
    }

    // Specific date — supports both orders:
    // "15th may", "1 may", "14 may" (day first)
    // "may 1st", "may 15", "may 1" (month first)
    const specificDate =
      message.match(
        /(\d{1,2})(st|nd|rd|th)?(\s+of)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
      ) ||
      message.match(
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(st|nd|rd|th)?/i,
      );
    if (specificDate) {
      entities.date = specificDate[0];
    }

    // ── Time ─────────────────────────────────────────────────────────────────
    // Specific clock time: "5 PM", "9am", "10:30 pm", "5:00 PM"
    const specificTime = message.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/i);
    if (specificTime) {
      entities.time = specificTime[0].trim();
    } else {
      // Period keywords
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
