'use strict';

function book(
  id,
  title,
  author,
  difficulty,
  minutes,
  summary,
  why,
  lessons,
  mind,
  concepts,
  hist = ''
) {
  return {
    id,
    title,
    author,
    coverUrl: '',
    summary,
    difficulty,
    readingTimeMinutes: minutes,
    whyRecommended: why,
    keyLessons: lessons,
    mindfulnessInsight: mind,
    concepts,
    historicalRelevance: hist,
  };
}

/**
 * Rich deterministic catalog when OpenRouter is unavailable.
 */
function buildMockDiscovery(queryKey) {
  const q = queryKey.toLowerCase();

  if (q.includes('rome') || q.includes('roman')) {
    return {
      topic: 'Ancient Rome',
      mindfulnessTip:
        'Let curiosity lead gently — read one chapter at a time and pause to picture the world those writers inhabited.',
      relatedTopics: ['Stoicism', 'Leadership', 'Ancient warfare', 'Republican politics', 'Mediterranean history'],
      learningPath: [
        'Start with a vivid narrative history',
        'Add a biography of a key leader',
        'Layer in primary sources lightly',
        'Connect themes to modern institutions',
      ],
      books: [
        book(
          'spqr',
          'SPQR: A History of Ancient Rome',
          'Mary Beard',
          'intermediate',
          420,
          'A sweeping yet accessible portrait of Roman power, citizenship, and daily life from the myths of Romulus to the empire’s edges.',
          'Balances scholarly depth with readable storytelling — ideal for understanding how Rome actually functioned.',
          ['Citizenship and rights', 'Expansion and identity', 'Women and slaves in the record', 'Why Rome still shapes law and language'],
          'Reading slowly mirrors Roman stoic practice: steady attention beats rushing through centuries.',
          ['Republic', 'Empire', 'Patricians', 'Legions', 'Forum', 'Augustus'],
          'Explains how Roman institutions echo in modern governments and legal systems.'
        ),
        book(
          'rubicon',
          'Rubicon: The Last Years of the Roman Republic',
          'Tom Holland',
          'beginner',
          380,
          'A narrative thriller-style history of Caesar, Pompey, and the crisis that ended the Republic.',
          'Highly readable entry point before denser academic texts on the same era.',
          ['Crisis of legitimacy', 'Civil war dynamics', 'Charisma and risk', 'Institutional decay'],
          'Notice where ambition narrows perspective — a mindfulness cue for modern leadership stress.',
          ['Caesar', 'Pompey', 'Senate', 'Civil war', 'Tribunes'],
          'Maps the final decades before autocracy reshaped the Mediterranean.'
        ),
        book(
          'decline-fall',
          'The History of the Decline and Fall of the Roman Empire',
          'Edward Gibbon',
          'advanced',
          1200,
          'Monumental Enlightenment-era analysis of imperial endurance, religion, and fragmentation across centuries.',
          'For readers ready for dense prose and sweeping argument after introductory narratives.',
          ['Christianity and empire', 'Administrative overstretch', 'Frontier pressures', 'Historiography as craft'],
          'Treat long chapters like meditation sits: set a timer, read one section, breathe, reflect.',
          ['Constantine', 'Byzantium', 'Barbarian migrations', 'Provincial governance'],
          'Frames how later Europeans interpreted Rome’s moral and political lessons.'
        ),
        book(
          'rise-rome',
          'The Rise of Rome',
          'Anthony Everitt',
          'beginner',
          340,
          'From village to superpower — clear storytelling of early expansion and republican virtues.',
          'Gentle on newcomers; pairs well with SPQR for a fuller arc.',
          ['Early kings', 'Punic Wars', 'Allies and assimilation', 'Roman virtues in propaganda'],
          'Pair reading with a short walk — movement helps integrate narrative history.',
          ['Early Republic', 'Carthage', 'Legions', 'Italian allies'],
          'Shows how myth and memory powered Roman collective identity.'
        ),
      ],
    };
  }

  if (q.includes('cell') || q.includes('molecular bio')) {
    return {
      topic: 'Cells & molecular life',
      mindfulnessTip:
        'Complex diagrams reward patient eyes — zoom one pathway at a time instead of the whole atlas at once.',
      relatedTopics: ['Genetics', 'Immunology', 'Cancer biology', 'Biochemistry', 'Evolution'],
      learningPath: [
        'Cell structure and energetics',
        'Gene expression basics',
        'Signaling pathways overview',
        'Disease mechanisms at cellular scale',
      ],
      books: [
        book(
          'cell-cooper',
          'The Cell: A Molecular Approach',
          'Geoffrey M. Cooper',
          'intermediate',
          600,
          'A respected undergraduate text linking structure, genomics, and regulation with clear diagrams.',
          'Bridges visuals and mechanisms — strong after high-school biology.',
          ['Membrane transport', 'Cell cycle checkpoints', 'Cytoskeleton', 'Apoptosis'],
          'Study in 25-minute blocks with breaks — spaced repetition beats marathon cramming.',
          ['Organelles', 'DNA repair', 'Kinases', 'CRISPR context'],
          ''
        ),
        book(
          'mol-cell-alberts',
          'Molecular Biology of the Cell',
          'Alberts et al.',
          'advanced',
          900,
          'The field’s canonical reference — deep coverage of experimental methods and molecular machines.',
          'Best once you have comfort with chemistry notation and cell basics.',
          ['Chromatin', 'Signal transduction', 'Cytoskeletal motors', 'Stem cell niches'],
          'Notice when overwhelm rises — label it, breathe, return to one figure only.',
          ['EM pictures', 'Pathways', 'Gene regulation', 'Cancer hallmarks'],
          ''
        ),
        book(
          'hidden-life',
          'I Contain Multitudes',
          'Ed Yong',
          'beginner',
          300,
          'A joyful tour of microbiomes — readable science writing about cells as ecosystems.',
          'Humanizes microscopic life before heavy textbooks.',
          ['Host–microbe symbiosis', 'Immune training', 'Evolution at micro scale'],
          'Gratitude for unseen helpers in your body pairs well with this book’s tone.',
          ['Microbiome', 'Immunity', 'Evolution', 'Ecology'],
          ''
        ),
      ],
    };
  }

  if (
    q.includes('business') ||
    q.includes('startup') ||
    q.includes('entrepreneur') ||
    q.includes('money') ||
    q.includes('finance') ||
    q.includes('invest')
  ) {
    return {
      topic: 'Business & entrepreneurship',
      mindfulnessTip:
        'Treat frameworks as experiments, not verdicts — one idea per week reduces cognitive overload.',
      relatedTopics: ['Leadership', 'Productivity', 'Marketing', 'Finance', 'Decision-making'],
      learningPath: [
        'Mindset and customer discovery',
        'Unit economics & finance basics',
        'Execution systems',
        'Scaling culture and strategy',
      ],
      books: [
        book(
          'lean-startup',
          'The Lean Startup',
          'Eric Ries',
          'beginner',
          280,
          'Build–measure–learn loops to validate ideas quickly with minimal waste.',
          'Foundational for product teams and first-time founders.',
          ['MVPs', 'Pivot vs persevere', 'Innovation accounting', 'Customer interviews'],
          'Rapid iteration pairs with mindful noticing — observe data without self-judgment.',
          ['Experimentation', 'Metrics', 'Product-market fit'],
          ''
        ),
        book(
          'zero-one',
          'Zero to One',
          'Peter Thiel with Blake Masters',
          'intermediate',
          260,
          'Contrarian questions about monopoly, secrets, and building genuinely new categories.',
          'Good after you grasp basic startup vocabulary.',
          ['Definite optimism', 'Secrets', 'Sales', 'Competition thinking'],
          'Ask “what important truth do few agree with me on?” — a reflective journaling prompt.',
          ['Monopoly', 'Technology', 'Founders'],
          ''
        ),
        book(
          'good-great',
          'Good to Great',
          'Jim Collins',
          'intermediate',
          320,
          'Research-backed traits of companies that sustained excellence versus mediocrity.',
          'Useful when you lead teams or evaluate culture.',
          ['Level 5 leadership', 'Hedgehog concept', 'Flywheel', 'Disciplined people/thought/action'],
          'Collins’ discipline theme aligns with gentle consistency over intensity spikes.',
          ['Culture', 'Strategy', 'Leadership'],
          ''
        ),
        book(
          'atomic-habits',
          'Atomic Habits',
          'James Clear',
          'beginner',
          260,
          'Tiny systems that compound — identity-based behavior design for work and life.',
          'Pairs with any business book to make insights stick.',
          ['Habit stacking', 'Environment design', 'Plateau of latent potential'],
          'Habits are mindfulness anchors — one clear cue, one satisfying completion.',
          ['Systems', 'Identity', 'Environment'],
          ''
        ),
      ],
    };
  }

  if (q.includes('psych') || q.includes('anxiety') || q.includes('mind')) {
    return {
      topic: 'Psychology & emotional wellness',
      mindfulnessTip:
        'Psychology texts land best when you connect one concept to one lived moment — keep a one-line journal nearby.',
      relatedTopics: ['CBT', 'Attachment', 'Neuroscience', 'Trauma-informed care', 'Habit change'],
      learningPath: ['Foundations of emotion', 'Cognitive patterns', 'Behavior change', 'Relationships and stress'],
      books: [
        book(
          'thinking-fast-slow',
          'Thinking, Fast and Slow',
          'Daniel Kahneman',
          'advanced',
          520,
          'Nobel laureate overview of heuristics, biases, and how we judge risk and reward.',
          'Dense but rewarding — read in short sections.',
          ['System 1 vs 2', 'Prospect theory', 'Overconfidence', 'Framing'],
          'Labeling biases as weather patterns, not character flaws, cultivates self-compassion.',
          ['Judgment', 'Decision', 'Bias'],
          ''
        ),
        book(
          'body-keeps-score',
          'The Body Keeps the Score',
          'Bessel van der Kolk',
          'intermediate',
          480,
          'Trauma, memory, and somatic pathways — influential clinical synthesis.',
          'Read with breaks; pair heavy chapters with grounding exercises.',
          ['Trauma responses', 'EMDR context', 'Neuroplasticity', 'Therapeutic options'],
          'Mindfulness here means titrating exposure — honor your window of tolerance.',
          ['PTSD', 'Nervous system', 'Therapy'],
          ''
        ),
        book(
          'happiness-hypothesis',
          'The Happiness Hypothesis',
          'Jonathan Haidt',
          'beginner',
          340,
          'Ancient wisdom meets modern psychology in approachable essays.',
          'Gentle bridge into academic psych themes.',
          ['Virtue ethics', 'Attachment', 'Divinity and meaning', 'Reciprocity'],
          'Each chapter invites reflection — end with three breaths before the next.',
          ['Meaning', 'Morality', 'Well-being'],
          '',
        ),
      ],
    };
  }

  if (q.includes('meditat') || q.includes('mindful') || q.includes('focus')) {
    return {
      topic: 'Meditation & focus',
      mindfulnessTip:
        'Books support practice; let each chapter inspire one small experiment on the cushion or at work.',
      relatedTopics: ['Stoicism', 'Neuroscience of attention', 'Buddhist psychology', 'Sleep'],
      learningPath: ['Attention basics', 'Working with distraction', 'Compassion skills', 'Integrating practice'],
      books: [
        book(
          'miracle-mindfulness',
          'The Miracle of Mindfulness',
          'Thich Nhat Hanh',
          'beginner',
          180,
          'Short letters on washing dishes, breathing, and everyday awareness.',
          'Ideal first book for embodied mindfulness language.',
          ['Breath anchors', 'Everyday mindfulness', 'Gentle discipline'],
          'Treat chores as mini-meditations — the book’s core invitation.',
          ['Zen', 'Awareness', 'Peace'],
          ''
        ),
        book(
          'waking-up',
          'Waking Up',
          'Sam Harris',
          'intermediate',
          220,
          'Secular look at consciousness, meditation instructions, and inquiry.',
          'For readers who want philosophy alongside technique.',
          ['Non-duality pointers', 'Concentration vs insight', 'Ethics of honesty'],
          'Notice the difference between observing a thought and fusing with it.',
          ['Consciousness', 'Inquiry', 'Secular practice'],
          ''
        ),
        book(
          'attention-merchant',
          'The Attention Merchants',
          'Tim Wu',
          'intermediate',
          360,
          'History of industries competing for human attention — context for digital mindfulness.',
          'Pairs well with focus training — know the terrain you navigate.',
          ['Advertising', 'Media cycles', 'Platform incentives'],
          'Awareness of external capture supports kind boundaries on devices.',
          ['Media', 'Economics', 'Attention'],
          ''
        ),
      ],
    };
  }

  // Generic curated response
  return {
    topic: queryKey.charAt(0).toUpperCase() + queryKey.slice(1),
    mindfulnessTip:
      'Start with one beginner-friendly title, take notes in your own words, and revisit key ideas after a night’s sleep.',
    relatedTopics: ['Critical thinking', 'Interdisciplinary links', 'Deeper dives', 'Related biographies', 'Primary sources'],
    learningPath: [
      'Orient with a broad popular introduction',
      'Add a focused intermediate text',
      'Challenge with one advanced perspective',
      'Synthesize with journaling or discussion',
    ],
    books: [
      book(
        'curious-minds',
        'Curious Minds: The Discoveries of Australian Science',
        'Various / popular science anthologies',
        'beginner',
        300,
        'A placeholder-style anthology path — swap for domain-specific bestsellers as Sym’s catalog grows.',
        'Sym recommends verifying titles in your region; use Discover again with a narrower keyword (e.g. “cosmology”, “ethics”).',
        ['How experts ask questions', 'Reading graphs and claims', 'Finding reputable reviews'],
        'Treat search as a single deep breath: inhale curiosity, exhale hurry.',
        ['Science', 'Method', 'Literacy'],
        ''
      ),
      book(
        'range',
        'Range: Why Generalists Triumph in a Specialized World',
        'David Epstein',
        'intermediate',
        340,
          'Explores learning breadth, analogical thinking, and late specialization.',
        'Excellent mindset companion while exploring new topics.',
        ['Sampling period', 'Analogies across domains', 'Kind learning environments'],
        'Breadth reduces anxiety about “picking wrong” — explore widely, then focus.',
        ['Learning', 'Careers', 'Creativity'],
        ''
      ),
      book(
        'structure-scientific',
        'The Structure of Scientific Revolutions',
        'Thomas S. Kuhn',
        'advanced',
        280,
          'Classic philosophy of science — paradigms, anomalies, and scientific change.',
        'For readers who want meta-understanding of how fields evolve.',
        ['Paradigms', 'Normal science', 'Crisis', 'Revolution'],
        'Holding paradigms lightly is a cognitive flexibility practice.',
        ['Epistemology', 'History of science'],
        ''
      ),
    ],
  };
}

module.exports = { buildMockDiscovery };
