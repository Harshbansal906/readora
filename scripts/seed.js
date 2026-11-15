/**
 * READORA — Production Seed Script for India
 * Generates 14 realistic Indian authors, 24 full-length essays (English + Hindi),
 * and relational follow rows. Safe to run repeatedly (idempotent).
 *
 * Run with: npm run seed
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initDB } = require('../db/database');

const AUTHORS = [
  {
    id: 'usr_ananya',
    name: 'Ananya Iyer',
    email: 'ananya.iyer@readora.in',
    handle: '@ananyaiyer',
    avatar: 'AI',
    bio: 'Philosopher, essayist, and researcher of Indian aesthetic traditions and classical metaphysics. Based in Chennai.',
    website: 'https://readora.in/@ananyaiyer'
  },
  {
    id: 'usr_rohan',
    name: 'Rohan Mehta',
    email: 'rohan.mehta@readora.in',
    handle: '@rohanmehta',
    avatar: 'RM',
    bio: 'Software architect and essayist writing on computational aesthetics, digital privacy, and open protocols. Bengaluru.',
    website: 'https://readora.in/@rohanmehta'
  },
  {
    id: 'usr_sameera',
    name: 'Sameera Khan',
    email: 'sameera.khan@readora.in',
    handle: '@sameerakhan',
    avatar: 'SK',
    bio: 'Cultural critic and architectural historian exploring urban memory, stepwells, and Mughal craftsmanship. New Delhi.',
    website: 'https://readora.in/@sameerakhan'
  },
  {
    id: 'usr_vikram',
    name: 'Vikram Rao',
    email: 'vikram.rao@readora.in',
    handle: '@vikramrao',
    avatar: 'VR',
    bio: 'Biologist and historian of science interested in ecological resilience, Western Ghats flora, and ancient botany. Mysuru.',
    website: 'https://readora.in/@vikramrao'
  },
  {
    id: 'usr_priya',
    name: 'Priya Nair',
    email: 'priya.nair@readora.in',
    handle: '@priyanair',
    avatar: 'PN',
    bio: 'Literary critic and translator of Malayalam modernism and Sanskrit dramatic theory. Kochi & London.',
    website: 'https://readora.in/@priyanair'
  },
  {
    id: 'usr_arjun',
    name: 'Arjun Sen',
    email: 'arjun.sen@readora.in',
    handle: '@arjunsengupta',
    avatar: 'AS',
    bio: 'Independent journalist covering agrarian commons, river systems, and environmental jurisprudence. Kolkata.',
    website: 'https://readora.in/@arjunsengupta'
  },
  {
    id: 'usr_kavita',
    name: 'Kavita Deshmukh',
    email: 'kavita.d@readora.in',
    handle: '@kavitad',
    avatar: 'KD',
    bio: 'Typography enthusiast, bookmaker, and interface designer studying Indic scripts and letterpress archives. Pune.',
    website: 'https://readora.in/@kavitad'
  },
  {
    id: 'usr_farhan',
    name: 'Farhan Siddiqui',
    email: 'farhan.s@readora.in',
    handle: '@farhans',
    avatar: 'FS',
    bio: 'Poet and scholar of Urdu ghazal metrics and progressive writers associations. Lucknow & Hyderabad.',
    website: 'https://readora.in/@farhans'
  },
  {
    id: 'usr_meera',
    name: 'Meera Bhattacharya',
    email: 'meera.b@readora.in',
    handle: '@meerab',
    avatar: 'MB',
    bio: 'Cognitive scientist studying multilingual thought, childhood linguistic scaffolding, and memory palaces. Kolkata.',
    website: 'https://readora.in/@meerab'
  },
  {
    id: 'usr_aditya',
    name: 'Aditya Nambiar',
    email: 'aditya.n@readora.in',
    handle: '@adityan',
    avatar: 'AN',
    bio: 'Systems engineer writing on high-reliability distributed engines and minimalist computing. Thiruvananthapuram.',
    website: 'https://readora.in/@adityan'
  },
  {
    id: 'usr_sunita',
    name: 'Sunita Sharma',
    email: 'sunita.sharma@readora.in',
    handle: '@sunitasharma',
    avatar: 'SS',
    bio: 'हिंदी साहित्य और भाषा दर्शन की अध्येता। बनारस और दिल्ली के साहित्यिक विमर्श पर नियमित लेखन।',
    website: 'https://readora.in/@sunitasharma'
  },
  {
    id: 'usr_arvind',
    name: 'Dr. Arvind Swaminathan',
    email: 'arvind.swamy@readora.in',
    handle: '@arvindswamy',
    avatar: 'AS',
    bio: 'Professor of Philosophy exploring comparative epistemology between Advaita, Buddhist Madhyamaka, and phenomenology.',
    website: 'https://readora.in/@arvindswamy'
  },
  {
    id: 'usr_devika',
    name: 'Devika Pillai',
    email: 'devika.pillai@readora.in',
    handle: '@devikapillai',
    avatar: 'DP',
    bio: 'Curator and visual ethnographer investigating weaving traditions, indigo dye vats, and textile geometry in coastal India.',
    website: 'https://readora.in/@devikapillai'
  },
  {
    id: 'usr_harsh',
    name: 'Harsh Bansal',
    email: 'harsh@readora.app',
    handle: '@harshbansal',
    avatar: 'HB',
    bio: 'Platform builder and essayist. Exploring quiet software tools, deep reading sanctuaries, and intentional systems.',
    website: 'https://readora.app/@harshbansal'
  }
];

// Helper to compute realistic UTC timestamp within the past 60 days
function pastDate(daysAgo, hourOffset = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setUTCHours(hourOffset, Math.floor(Math.random() * 59), 0, 0);
  return d.toISOString();
}

// 24 Full Essays (>400 words each) in English and Hindi
const ESSAYS = [
  {
    id: 'essay_solitude_01',
    authorId: 'usr_ananya',
    title: 'The Architecture of Solitude: Why Deep Work Demands an Unconnected Mind',
    subtitle: 'On the gradual erosion of continuous attention, and how the physical layout of our thinking spaces shapes the literature we produce.',
    category: 'Philosophy',
    language: 'en',
    daysAgo: 2,
    content: `In an era defined by continuous telemetry and reflexive notifications, the quiet room has become an endangered sanctuary.

## The Quiet Space as an Instrument of Thought
When Montaigne retreated to his tower library in the Dordogne, surrounded by circular stone walls lined with Greek and Latin volumes, he was not escaping reality—he was constructing an instrument calibrated for sustained thought.

> "We must reserve a back-shop, all our own, entirely free, wherein to establish our true liberty and principal retreat and solitude."

The modern workspace, by contrast, is architected around maximum permeability. Glass partitions, open-plan bullpens, and the infinite ambient chatter of digital channels do not merely interrupt us; they dismantle the fragile scaffolding of prolonged contemplation. Every interruption imposes an attentional switching cost that lingers long after our eyes return to the primary task. When consciousness is fractured every four minutes, thoughts remain trapped in the shallows of reactive synthesis.

## The Tyranny of the Rapid Answer
When every message demands an instantaneous response, the mind naturally shifts towards shallower, lower-stakes hypotheses. Ideas that require forty minutes of silent gestation before their contradictions become clear are discarded in favor of conclusions that can be communicated in a sentence or two. We begin to favor the quip over the argument, the aphorism over the treatise.

In traditional Indian epistemologies, from the Upanishadic dialogues to the Buddhist dialectics of Nalanda, contemplation (*manana*) and deep absorption (*nididhyasana*) were not treated as passive luxuries. They were recognized as rigorous cognitive requirements for penetrating beyond sensory illusion (*maya*). To understand the nature of a complex system, the observer must still the ripples on the surface of awareness.

## Reclaiming the Boundary
To produce work that endures beyond the immediate news cycle, one must deliberately court silence. The door must shut; the network connection must be severed; the blank manuscript must be granted its rightful, terrifying expanse. We must reclaim our right to be unreachable, even if only for three uninterrupted hours every morning. It is within those silent hours that true intellectual courage is forged, where thoughts grow deep roots and literature discovers its enduring cadence.`
  },
  {
    id: 'essay_slow_journal_02',
    authorId: 'usr_priya',
    title: 'Against the Feed: In Defense of the Long Sentence and the Slow Journal',
    subtitle: 'How the brevity of modern social interfaces rewires cognitive habits toward immediate affirmation rather than sustained contemplation.',
    category: 'Culture',
    language: 'en',
    daysAgo: 4,
    content: `The feed is designed for cadence, not depth. It rewards the punchline, the immediate grievance, and the visual shock. Over years of continuous exposure, it reshapes the rhythm of our internal monologue.

## The Disappearance of Subordinate Clauses
Notice how seldom one encounters a compound-complex sentence online. The grammatical subordination required to balance conflicting ideas—"Although X appears undeniable at first glance, the historical precedent of Y suggests that Z remains unresolved"—has been flattened into bumper-sticker declarative assertions. When we reduce our syntax, we reduce the complexity of the thoughts we are capable of holding. 

Language is not merely a vehicle for transmitting pre-existing thoughts; it is the laboratory in which thoughts are formulated and tested. When the grammar of public discourse collapses into character limits and algorithmic hooks, our capacity for ambivalence, doubt, and measured judgment withers alongside it.

## The Architecture of the Slow Journal
A slow journal, whether printed on paper or rendered in a quiet digital layout with generous margins, invites a fundamentally different posture. It asks the reader to sit with an author across four thousand words, following the bends and tributaries of an unfolding thesis. In a slow journal, an essay does not need to declare an immediate verdict; it can explore the tension between two equally compelling truths.

Consider the literary tradition of the *bhashya*—the classical commentary—where scholars would spend decades dissecting a single sutra. The goal was never rapid consensus, but the illumination of hidden nuances. When we read slowly, our breathing slows; our critical faculties awaken; we become active participants in an enduring conversation rather than passive consumers of outrage.`
  },
  {
    id: 'essay_subtle_systems_03',
    authorId: 'usr_rohan',
    title: 'Subtle Systems: Designing Software That Does Not Demand Your Glance',
    subtitle: 'A manifesto for calm technology, tactile typography, and interfaces inspired by paper bindings rather than casino mechanics.',
    category: 'Design',
    language: 'en',
    daysAgo: 6,
    content: `Software used to be a tool that sat quietly in the drawer until called upon. Today, it behaves like an anxious puppy, constantly vibrating against the wrist and clamoring for attention.

## Principles of Quiet Technology
1. **Never notify unless the house is burning.** If an event can wait twelve hours without catastrophe, it does not belong in an intrusive push alert.
2. **Respect the visual field.** Interfaces should possess the low-contrast dignity of a printed ledger or a hardcover book. Hairline rules, unadorned typography, and generous margins allow the eye to rest.
3. **Finishable states.** A software tool should have an end. When you finish reading an essay or reviewing your daily notes, there should be whitespace—not an infinite vortex of algorithmic recommendations designed to keep you scrolling.

## The Dignity of the Tool
A hammer does not buzz in your toolbox to remind you that you have not driven a nail in three hours. A fountain pen does not display an unread badge on its cap. They are instruments of human agency, waiting patiently for human intention. 

When software designers treat human attention as a resource to be mined and monetized through slot-machine variable reward schedules, they debase both the craft of programming and the autonomy of the user. We must build systems that respect our boundaries, that honor our silence, and that fade into the background the moment our creative work begins.`
  },
  {
    id: 'essay_math_literary_04',
    authorId: 'usr_meera',
    title: 'The Quiet Craft of Proof: Mathematics as a Literary Tradition',
    subtitle: 'Beyond utilitarian computation lies a three-thousand-year-old dialogue of prose, aesthetics, and deductive elegance.',
    category: 'Science',
    language: 'en',
    daysAgo: 8,
    content: `We are taught in secondary school that mathematics is about finding the numerical answer. But working mathematicians know that the answer is often the least interesting part; it is the path of proof—the rhetorical architecture—that endures.

## The Anatomy of an Elegant Proof
A mathematical proof is an essay written under the strictest conceivable stylistic constraints. Euclid, Fermat, Ramanujan, and Emmy Noether were stylists as much as logicians, crafting demonstrations whose beauty lies in the absolute economy of their assumptions. When Ramanujan recorded his identities in his notebooks without formal derivations, he was not guessing; he was perceiving relationships of sublime symmetry that had the force of poetic truth.

Consider G.H. Hardy's reflection in *A Mathematician's Apology*: "The mathematician's patterns, like the painter's or the poet's, must be beautiful; the ideas, like the colors or the words, must fit together in a harmonious way." A clunky, brute-force computational proof may verify a theorem, but an elegant proof illuminates *why* the theorem must be true.

## The Discipline of Clarity
Writing mathematics forces an author to confront every concealed assumption. There is no room for rhetorical bluster or decorative ambiguity. Every lemma is a stepping stone across an abyss of uncertainty. In an intellectual culture increasingly polluted by posturing and vague assertion, the quiet rigor of mathematical prose stands as a beacon of what human minds can achieve when they submit themselves to truth.`
  },
  {
    id: 'essay_stepwells_05',
    authorId: 'usr_sameera',
    title: 'Inverted Palaces: The Sacred Hydraulics of Indian Stepwells',
    subtitle: 'How medieval subterranean water architecture combined climatic survival with contemplative spiritual choreography.',
    category: 'Culture',
    language: 'en',
    daysAgo: 11,
    content: `Across the arid landscapes of Gujarat and Rajasthan, the earth opens up into stone canyon temples carved not towards the heavens, but downwards toward the deep aquifers of the earth. These are the *vavs* and *baolis*—the monumental stepwells of medieval India.

## Descent into the Subterranean Cool
To step down into the Rani ki Vav in Patan or Chand Baori in Abhaneri is to experience an inversion of classical architectural values. As the harsh midday desert heat of forty-five degrees Celsius presses down above, each flight of stone steps leads downward into a realm of deepening shadow and cooling air. The temperature drops five, ten, twelve degrees. The sound of wind gives way to the gentle echo of water against sandstone.

The stepwell was never purely utilitarian infrastructure. It was a civic sanctuary, a gathering place for women carrying earthen pots, a shelter for caravan travelers along ancient trade routes, and a sacred mandapa where water was venerated as the source of all life. Hundreds of carved deities—Vishnu reclining on the cosmic serpent Shesha, water nymphs, and celestial dancers—line the subterranean galleries, reminding the visitor that the water table itself is holy ground.

## Lessons for Contemporary Water Resilience
As modern Indian megacities struggle with drying borewells and asphalt that repels rainfall, the stepwell offers a profound historical lesson. The medieval master builders understood seasonal hydrology: they designed catchment systems that collected every drop of monsoon runoff, allowing it to percolate slowly through silt and recharge the earth. They built with local stone, passive geometry, and a reverence for the watershed. We would do well to study their blueprints.`
  },
  {
    id: 'essay_kalamkari_06',
    authorId: 'usr_devika',
    title: 'The Grammar of Indigo: Textile Geometry and the Botany of Color',
    subtitle: 'How natural dyeing traditions in coastal Andhra preserved mathematical precision through botanical alchemy.',
    category: 'Design',
    language: 'en',
    daysAgo: 14,
    content: `In the Coromandel coast workshops of Machilipatnam and Srikalahasti, the smell of fermented indigo, myrobalan nuts, and iron rust fills the air. Here, the ancient art of Kalamkari—drawing with a bamboo pen (*kalam*)—transforms unbleached cotton into complex mythological narratives and mathematical repeats.

## The Chemistry of Slow Color
Unlike synthetic aniline dyes that coat fibers instantly with petroleum pigments, natural dyeing is an organic dialogue with time and temperature. Indigo (*Indigofera tinctoria*) does not dissolve in water; it must be reduced in underground terracotta vats using lime and jaggery until the liquid turns yellow-green with a coppery scum. When the cloth is dipped and drawn into the open air, oxygen works its quiet alchemy: the greenish cloth turns brilliant blue before your eyes.

Every color requires a distinct mordant and bath. Red from madder root (*Rubia cordifolia*), yellow from pomegranate rinds, black from iron filings steeped in fermented molasses. If a single step is rushed, the colors wash away. The artisan must know the mineral content of the local river water, the humidity of the sea breeze, and the phase of the moon.

## Symmetry and the Sacred Grid
The geometric borders of Kalamkari textiles reveal an intuitive mastery of crystallographic symmetry groups. Floral arabesques and intertwining vine motifs (*creepers*) repeat with mathematical exactness across thirty-meter lengths of cloth. This is design rooted in ecology: the materials come from the surrounding soil, and when the textile reaches the end of its decades-long life, it returns harmlessly to the earth.`
  },
  {
    id: 'essay_western_ghats_07',
    authorId: 'usr_vikram',
    title: 'The Cloud Forests of Agumbe: Notes on Canopy Ecology and Vanishing Microclimates',
    subtitle: 'Reflections from three seasons in the Western Ghats rainforest on why biodiversity resists quantification.',
    category: 'Science',
    language: 'en',
    daysAgo: 16,
    content: `When the southwest monsoon slams into the escarpment of the Western Ghats, Agumbe receives over seven thousand millimeters of rain in three months. The forest becomes an ocean suspended in air.

## The Vertical Layering of Life
To walk through a primary tropical evergreen forest is to realize how inadequate our two-dimensional maps are. The true action occurs forty meters above ground, in the dense, epiphytic canopy where orchids, mosses, ferns, and flying frogs live out their entire lifecycles without ever touching the forest floor. Every ancient *Dipterocarpus* tree is an entire continent of symbiotic relationships.

During my months recording amphibian vocalizations in the night rain, I learned that biodiversity cannot be measured simply by a list of species names. It is the intricate web of behavioral interactions—the specific fungus that germinates only when passed through the gut of a Malabar pied hornbill, the solitary wasp that pollinates a single species of wild fig—that holds the forest together.

## The Fragility of Island Biogeography
Because the Western Ghats are an ancient continental range, older even than the Himalayas, species have evolved in tiny microclimatic pockets on isolated ridge-lines. A difference of two hundred meters in elevation creates a distinct rainfall and mist regime. When linear infrastructure—roads, power lines, railway tracks—cuts across these ridges, it does not merely fell trees; it slices through delicate microclimates that have remained stable for fifty million years.`
  },
  {
    id: 'essay_hindi_bhasha_08',
    authorId: 'usr_sunita',
    title: 'मौन और संवाद: कबीर के उलटबांसी में भाषा की पराकाष्ठा',
    subtitle: 'कबीर के पदों में विरोधाभास और प्रतीकों के माध्यम से सत्य की खोज—जब शब्द अपनी सीमा पर पहुँचकर मौन हो जाते हैं।',
    category: 'Philosophy',
    language: 'hi',
    daysAgo: 18,
    content: `संत कबीर की वाणी का सबसे विलक्षण और विचारोत्तेजक रूप उनकी ‘उलटबांसी’ में दिखाई देता है। उलटबांसी केवल भाषा का कौतुक या पहेली नहीं है, बल्कि वह चेतना को उसकी स्थापित धारणाओं से झकझोरने का एक दार्शनिक अस्त्र है।

## भाषा की सीमा और अनिर्वचनीय सत्य
कबीर कहते हैं: *"एक अचंभा देखा रे भाई, ठाढ़ा सिंह चरावे गाई। जल की मछली तरुवर ब्याई, पकरि बिलाई मुरगे खाई।"* साधारण दृष्टि से यह असंभव और हास्यास्पद लगता है—गाय शेर को चरा रही है, मछली पेड़ पर ब्या रही है। लेकिन आध्यात्मिक और रूपक के स्तर पर यह चित्त की वृत्तियों, बुद्धि और अंतर्दृष्टि के गहरे संतुलन का संकेत है। कबीर जानते थे कि जो सत्य तार्किक भाषा के ढांचे में नहीं समा सकता, उसे कहने के लिए भाषा को उल्टा करना पड़ता है।

जब सामान्य भाषा सांसारिक व्यवहार तक सीमित हो जाती है, तब परम तत्व को व्यक्त करने के लिए संत कवियों ने प्रतीकों का सहारा लिया। यह परंपरा केवल कबीर तक सीमित नहीं है; सिद्धों और नाथों के 'संध्या भाषा' में भी यही गूढ़ार्थ मिलता है। उलटबांसी पाठक को रुकने, सोचने और अपनी पूर्व-मान्यताओं को तोड़ने के लिए विवश करती है।

## आधुनिक संदर्भ में मौन की आवश्यकता
आज के सूचना-विस्फोट के युग में, जहाँ हर बात को तुरंत और सतही ढंग से कह देने की होड़ मची है, कबीर की उलटबांसी हमें ठहरना सिखाती है। यह हमें याद दिलाती है कि हर गहरी अनुभूति तुरंत समझ में आने वाली नहीं होती। कुछ सत्यों को समझने के लिए अंतःकरण में उस मौन की आवश्यकता होती है, जहाँ शब्द समाप्त होते हैं और अर्थ का साक्षात्कार होता है।`
  },
  {
    id: 'essay_indic_typography_09',
    authorId: 'usr_kavita',
    title: 'Curves of the Palm Leaf: How Materials Shaped Indic Scripts',
    subtitle: 'From stylus incisions on dried talipot leaves to digital OpenType shaping engines—a material history of Indian letterforms.',
    category: 'Design',
    language: 'en',
    daysAgo: 21,
    content: `Look closely at the rounded, flowing letterforms of Malayalam, Telugu, Kannada, and Odia. Their loops and arcs contrast sharply with the horizontal head-strokes (*shirorekha*) of Devanagari and Bengali. Why did scripts from the same Brahmi ancestor diverge so radically in their geometry?

## The Tyranny of the Palm Leaf
The answer lies in the material surface upon which words were written for over two millennia: the palm leaf (*borassus flabellifer* or *corypha umbraculifera*). In southern and coastal India, scribes incised letters onto dried, pressed palm leaves using a sharp metal stylus (*ezhuthani*), rubbing carbon black or charcoal dust into the grooves to reveal the text.

If an incised stroke was straight and horizontal, running parallel to the natural longitudinal veins of the dried leaf, the sharp stylus would split the leaf clean in two. To preserve the manuscript, scribes intuitively developed rounded, circular letterforms that crossed the grain at oblique angles. In northern India, where birch bark (*bhurjapatra*) and later paper were more readily available, straight horizontal strokes posed no structural threat, allowing the distinctive continuous head-stroke to flourish.

## Bringing Material Wisdom to Digital Screens
When European missionaries and colonial punchcutters brought metal type to India in the eighteenth and nineteenth centuries, they struggled to accommodate the complex conjunct consonants (*samyuktaksharas*) and vowel signs (*matras*) of Indic scripts into rectangular lead matrices. Today, modern digital OpenType shaping engines and variable fonts allow Indic typographers to restore the fluid, rhythmic grace that our ancestors etched into palm leaves.`
  },
  {
    id: 'essay_advaita_dialogue_10',
    authorId: 'usr_arvind',
    title: 'The Mirror and the Wave: Epistemology in Classical Indian Debates',
    subtitle: 'Examining the dialogue between Shankara, Nagarjuna, and the Nyaya realists on the nature of perception and consciousness.',
    category: 'Philosophy',
    language: 'en',
    daysAgo: 23,
    content: `For over a thousand years, the philosophical centers of India—from Kashi to Kanchipuram, Ujjain to Nalanda—thrived on intense, highly structured debate (*vada*). Epistemology was not an academic side-inquiry; it was the essential foundation upon which every metaphysical claim had to be established.

## The Pramanas: Instruments of Valid Knowledge
Every school of Indian thought was defined by the valid means of knowledge (*pramanas*) it accepted. The materialist Charvakas accepted only direct perception (*pratyaksha*). The Buddhists added logical inference (*anumana*). The Nyaya realists and Advaitins expanded this to include analogy (*upamana*) and authoritative testimony (*shabda*). 

What makes these classical debates electrifying to read today is the uncompromising rigor with which opponents analyzed the cognitive mechanism itself. When Nagarjuna deploys his four-fold negation (*catushkoti*) in the *Mulamadhyamakakarika*, he dismantles every conceivable conceptual stance: a phenomenon does not arise from itself, nor from another, nor from both, nor without cause. He uses rigorous logic to demonstrate the limits of conceptual thought, leading the mind to the threshold of direct, unmediated realization (*shunyata*).

## The Contemporary Relevance of Vada
Modern online discourse suffers from bad-faith rhetoric, strawman distortions, and emotional manipulation. The classical Indian code of debate, formalized in texts like the *Nyaya Sutras*, strictly prohibited these fallacies (*hetvabhasa*). An opponent was required to state their rival's position (*purvapaksha*) with complete accuracy and charity before attempting to refute it (*khandana*). If we adopted even a fraction of this intellectual honesty in our public discourse, our conversations would be transformed.`
  },
  {
    id: 'essay_river_commons_11',
    authorId: 'usr_arjun',
    title: 'Whose River Is It Anyway? Water Jurisprudence and the Crisis of the Commons',
    subtitle: 'Investigating riparian rights, seasonal floodplains, and the legal fiction of rivers as living juristic persons.',
    category: 'Science',
    language: 'en',
    daysAgo: 26,
    content: `When the High Court of Uttarakhand declared the Ganga and Yamuna rivers as living legal persons possessing all corresponding rights, duties, and liabilities in 2017, the judgment captured global headlines. Yet on the ground, the ecological reality of Indian rivers remains fraught with peril.

## The Fiction of River Interlinking
Rivers are not water pipes. They are complex ecological systems comprising seasonal floodplains, subterranean alluvial aquifers, riparian forests, sediment flows, and estuarine deltas. When civil engineering projects approach rivers solely through the metric of "surplus" and "deficit" basins, seeking to divert water through concrete canals, they ignore the fundamental ecology of the riverbed.

A river needs its floodplains during the monsoon to disperse excess energy, deposit fertile silt, and recharge regional groundwater. When embankments constrict a river into a narrow canal to reclaim land for real estate development, the river invariably asserts its natural geometry during extreme weather events, leading to catastrophic urban inundation.

## Restoring the Ecological Flow
To save our river systems, environmental law must move beyond punitive litigation after pollution has already occurred. We must establish legally binding environmental flows (*e-flows*) that guarantee the minimum volume of clean water necessary for aquatic ecosystems to survive year-round. Most importantly, we must restore community stewardship over local watersheds, treating rivers not as state commodities, but as common heritage held in trust for generations to come.`
  },
  {
    id: 'essay_urdu_ghazal_12',
    authorId: 'usr_farhan',
    title: 'The Geometry of Longing: Metrical Architecture in the Urdu Ghazal',
    subtitle: 'How strict prosodic meters (behr), refrain (radif), and rhyme (qafia) create infinite expressive freedom within absolute constraint.',
    category: 'Culture',
    language: 'en',
    daysAgo: 29,
    content: `To the uninitiated listener, the Urdu ghazal sounds like an effortless outpouring of romantic emotion. But beneath that melodic surface lies one of the most mathematically rigorous prosodic systems in world literature.

## The Laws of Behr, Qafia, and Radif
Every ghazal is composed of autonomous couplets (*shers*), each a self-contained universe of meaning across two lines. A ghazal does not tell a continuous chronological story; each couplet can shift tone from metaphysical inquiry to political protest to romantic grief.

What binds the entire poem together are three inviolable formal constraints:
1. **Behr (Meter):** Both lines of every couplet must adhere strictly to a chosen classical quantitative meter of long and short syllables (*rukns*).
2. **Qafia (Rhyme):** The rhyming sound that precedes the refrain.
3. **Radif (Refrain):** The exact word or phrase repeated at the end of both lines of the opening couplet (*matla*) and the second line of every subsequent couplet.

## Freedom Through Constraint
Mir Taqi Mir, Mirza Ghalib, and Faiz Ahmad Faiz achieved sublime poetry not by breaking these formal chains, but by dancing within them. When Ghalib writes:
> *Hazaaron khwahishen aisi ke har khwahish pe dam nikle,*
> *Bahut nikle mere armaan lekin phir bhi kam nikle.*

The repetition of the radif (*nikle*) creates a hypnotic rhythmic heartbeat that turns personal disappointment into a universal reflection on human desire. The strictness of the form forces the poet to distill language to its crystalline essence. Every syllable matters; every caesura breathes.`
  },
  {
    id: 'essay_distributed_systems_13',
    authorId: 'usr_aditya',
    title: 'The Myth of Zero Downtime: Embracing Failure in Distributed Computing',
    subtitle: 'Why the pursuit of perfect system availability is a mathematical illusion, and how resilient systems design for inevitable partition.',
    category: 'Technology',
    language: 'en',
    daysAgo: 32,
    content: `In early engineering meetings, stakeholders invariably ask for a system that "never goes down." Senior architects smile politely, because the laws of physics and network topology have already answered that question through Eric Brewer's CAP theorem.

## The Inevitability of Network Partitions
In a distributed system operating across multiple availability zones, network partitions are not anomalies; they are guaranteed physical realities. Undersea fiber cables get snagged by fishing trawlers; routing tables flap; garbage collection pauses freeze virtual machines; switches overheat. When a partition occurs, your system *must* choose between consistency and availability. You cannot have both.

Attempting to build an illusion of synchronous consistency across wide-area networks leads to catastrophic failure modes: cascading timeouts, thread starvation, and deadlocks that bring down entire platforms. High-reliability systems accept failure as a primary design parameter.

## Patterns of Resilience
1. **Graceful degradation:** If the recommendation engine fails, serve static curated lists. Never let a non-critical component bring down the primary user flow.
2. **Idempotency by default:** Every write operation should be safe to retry multiple times without corrupting state.
3. **Backpressure and circuit breakers:** When an upstream service slows down, shed load immediately rather than queueing requests until memory exhausts. Resilient software mimics biological organisms: it absorbs shocks, isolates damaged tissue, and continues functioning.`
  },
  {
    id: 'essay_hindi_itihas_14',
    authorId: 'usr_sunita',
    title: 'इतिहास की गूंज: भारतीय नगरों का सांस्कृतिक और स्थापत्य रूपांतरण',
    subtitle: 'बनारस की गलियों से लेकर चंडीगढ़ के आधुनिकतावादी ग्रिड तक—हमारे शहर किस प्रकार हमारी सामूहिक चेतना को आकार देते हैं।',
    category: 'Culture',
    language: 'hi',
    daysAgo: 35,
    content: `शहर केवल ईंट और गारे के ढांचे नहीं होते; वे मानवीय सभ्यता की आकांक्षाओं, संघर्षों और स्मृतियों के जीवित संग्रहालय होते हैं। भारत के प्राचीन और आधुनिक नगरों की तुलना करने पर यह स्पष्ट होता है कि नगर नियोजन का हमारे जीवन-दर्शन पर कितना गहरा प्रभाव पड़ता है।

## प्राचीन नगरों का जैविक विकास
काशी (बनारस) जैसे शहर किसी नक्शे पर खींचकर नहीं बसाए गए थे। वे सदियों के दौरान गंगा के प्रवाह, तीर्थयात्रियों के कदमों और स्थानीय समुदाय की जरूरतों के अनुसार जैविक रूप से विकसित हुए। बनारस की संकरी गलियाँ, जहाँ दो लोग भी मुश्किल से एक साथ गुजर सकते हैं, धूप को रोकती हैं और पैदल चलने वालों को छायादार ठंडक प्रदान करती हैं। यहाँ हर मोड़ पर एक मंदिर, एक चौपाल और एक कुआँ है, जो सामाजिक जुड़ाव को बढ़ावा देता है।

इसके विपरीत, स्वतंत्रता के बाद निर्मित चंडीगढ़ जैसे आधुनिक नगरों में ली कोर्बुज़िए की ज्यामितीय सोच दिखाई देती है। चौड़ी सड़कें, सख्त सेक्टोरल विभाजन और कारों को प्राथमिकता देने वाला यह मॉडल आधुनिक तो है, लेकिन इसमें वह मानवीय गर्माहट और सहज संवाद अक्सर खो जाता है जो पारंपरिक भारतीय बाजारों की पहचान रहा है।

## भविष्य के शहरों की तलाश
आज जब हम 'स्मार्ट सिटी' की बात करते हैं, तो हमें यह सोचना होगा कि तकनीक के साथ-साथ हम अपने शहरों की मानवीय आत्मा को कैसे बचाएं। शहर ऐसे होने चाहिए जहाँ पैदल चलने वाले को सम्मान मिले, जहाँ हरित स्थल और जल निकाय सुरक्षित रहें, और जहाँ इतिहास और भविष्य एक दूसरे से संवाद कर सकें।`
  },
  {
    id: 'essay_bengal_renaissance_15',
    authorId: 'usr_arjun',
    title: 'The Ink of Bengal: Printing Presses and the Birth of Modern Prose',
    subtitle: 'From the Serampore Baptist Mission press to the Battala cheap print revolution in nineteenth-century Calcutta.',
    category: 'Culture',
    language: 'en',
    daysAgo: 38,
    content: `In 1800, on the western bank of the Hooghly river in the Danish enclave of Serampore, William Carey and Charles Wilkins began casting Bengali movable metal type. Within three decades, that small missionary printing press had sparked a literary wildfire across colonial Bengal.

## The Battala Print Phenomenon
While academic histories often focus on the elite literary journals of the Brahmo Samaj, the real democratization of print occurred in Battala, the bustling printing district of north Calcutta. Here, hundreds of tiny, vernacular letterpress workshops churned out inexpensive paperbacks, mythological folk tales, almanacs (*panjikas*), satirical farces, and woodcut illustrated songbooks.

For the first time in South Asian history, reading was no longer the exclusive privilege of court poets or Sanskrit scholars. Rickshaw pullers, domestic workers, and merchants could buy an eight-page printed pamphlet for two paise and read it by oil lamp in the evening. Battala created a mass reading public with an insatiable appetite for prose.

## The Birth of Modern Literary Form
This vibrant commercial print culture laid the soil from which the literary masterpieces of Bankim Chandra Chattopadhyay, Michael Madhusudan Dutt, and Rabindranath Tagore would emerge. Modern Bengali prose learned its balance—combining the classical majesty of Sanskrit vocabulary with the vital colloquial energy of the Calcutta bazaar.`
  },
  {
    id: 'essay_minimal_computing_16',
    authorId: 'usr_rohan',
    title: 'The 100-Year Web Page: Building for Digital Permanence',
    subtitle: 'How plain semantic HTML, minimal CSS, and zero client-side frameworks ensure text remains readable a century from now.',
    category: 'Technology',
    language: 'en',
    daysAgo: 40,
    content: `Open a web page built with a cutting-edge JavaScript framework from 2014 today. The odds are overwhelming that the dependencies have rotted, the build tools no longer compile, and the page renders as a blank white screen.

## The Fragility of Modern Web Bloat
The average web page today ships four megabytes of JavaScript, thirty external tracker scripts, and hundreds of transitive npm dependencies simply to render five paragraphs of text. We have created a software ecosystem of breathtaking fragility, where text is held hostage by ephemeral client-side frameworks that break with every browser update.

Contrast this with the world's first web page, created by Tim Berners-Lee at CERN in 1991. Written in simple, unadorned HTML, it still renders flawlessly in any browser on the planet, thirty-five years later. It will render flawlessly thirty-five years from now.

## Rules for Longevity
1. **HTML is the permanent archive.** Text and links should be present in the raw HTTP response, readable without executing a single line of JavaScript.
2. **CSS is presentation, not prerequisite.** If stylesheets fail to load, the document should remain clean, structured, and legible.
3. **Zero runtime dependencies for content.** An essay should not require a remote server to spin up a headless browser container to index its words.

If we wish our essays, reflections, and literature to survive for future generations, we must build on foundational protocols rather than fleeting commercial toolchains.`
  },
  {
    id: 'essay_buddhism_mind_17',
    authorId: 'usr_arvind',
    title: 'The Illusion of the Persistent Self: Contemporary Neuroscience Meets Anatta',
    subtitle: 'Why modern cognitive science is converging on the Buddhist insight that the ego is a continuous narrative construction.',
    category: 'Philosophy',
    language: 'en',
    daysAgo: 43,
    content: `When the Buddha articulated the doctrine of *anatta* (non-self) twenty-five centuries ago, asserting that beneath our sensations, perceptions, thoughts, and consciousness there is no unchanging, permanent soul (*atman*), it was considered a radical departure from orthodox Vedic thought.

## The Default Mode Network and the Storytelling Brain
Today, cognitive neuroscientists studying functional magnetic resonance imaging (fMRI) data are arriving at an astonishingly similar conclusion. When the human brain is not engaged in an active, focused task, a constellation of interconnected regions known as the Default Mode Network (DMN) activates. The DMN is the neural substrate of mind-wandering, past regret, future anxiety, and autobiographical narrative—the ongoing mental movie titled "Me."

Neuroscientists like Michael Gazzaniga have demonstrated through split-brain experiments that the left hemisphere contains an "interpreter" module that constantly invents retrospective justifications for decisions made by subconscious emotional networks. The self is not a centralized commander sitting in the control room; it is a story the brain tells itself after the fact.

## Liberation from the Fiction
Seeing through the illusion of a solid, permanent ego is not a nihilistic realization. On the contrary, it is the root of profound psychological relief. If there is no rigid self to defend, then criticism loses its sting, status anxiety dissolves, and compassion for the shared vulnerability of all conscious beings naturally arises.`
  },
  {
    id: 'essay_ayurveda_ecology_18',
    authorId: 'usr_vikram',
    title: 'The Season of Rains: Ritucharya and the Biological Wisdom of the Monsoon',
    subtitle: 'Examining classical Ayurvedic seasonal regimens through modern chronobiology and gut microbiome research.',
    category: 'Science',
    language: 'en',
    daysAgo: 46,
    content: `In the classical medical treatises of Charaka and Sushruta, human health was never analyzed in clinical isolation from the surrounding biosphere. The concept of *Ritucharya*—seasonal regimen—treated human physiology as a fluid expression of the annual solar and lunar cycles.

## The Fragility of Varsha Ritu
According to Charaka, the monsoon season (*Varsha Ritu*) presents a unique biological challenge. After the intense solar heat of *Grishma* has depleted bodily vitality, the sudden arrival of cold rain, humid winds, and muddy runoff weakens the digestive fire (*agni*). Pathogenic microbes proliferate in stagnant water; food spoils rapidly; inflammatory conditions flare.

The classical prescription was meticulous: consume warm, light, freshly prepared foods; incorporate digestive bitters and astringents like ginger and cumin; avoid raw leafy greens that harbor monsoon parasites; and drink water boiled with herbs. 

## Chronobiology and the Circadian Gut
Modern microbiome sequencing reveals that our intestinal bacterial populations fluctuate significantly across seasons in response to temperature, humidity, and available food sources. Our immune system has an internal seasonal clock that anticipates winter respiratory infections and summer enteric stress. What ancient physicians understood through centuries of empirical observation, contemporary chronobiologists are confirming through molecular genetics.`
  },
  {
    id: 'essay_hindi_kala_19',
    authorId: 'usr_sunita',
    title: 'रस और सौंदर्य: भरतमुनि के नाट्यशास्त्र का समकालीन पाठ',
    subtitle: 'विभाव, अनुभाव और व्यभिचारी भाव के संयोग से रस की निष्पत्ति—भारतीय कला दृष्टि में दर्शक केवल भोक्ता नहीं, सहृदय है।',
    category: 'Design',
    language: 'hi',
    daysAgo: 49,
    content: `भारतीय सौंदर्यशास्त्र का सबसे महत्वपूर्ण स्तंभ भरतमुनि द्वारा रचित ‘नाट्यशास्त्र’ है। इसमें प्रस्तुत ‘रस सिद्धांत’ केवल रंगमंच या नाटक तक सीमित नहीं है, बल्कि वह चित्रकला, साहित्य, संगीत और आधुनिक दृश्य कलाओं को समझने की भी एक सार्वभौमिक कुंजी है।

## रस निष्पत्ति का सूत्र
भरतमुनि का प्रसिद्ध सूत्र है: *"विभावानुभावव्यभिचारिसंयोगाद्रसनिष्पत्तिः"* अर्थात् विभाव (कारण), अनुभाव (शारीरिक प्रतिक्रिया) और व्यभिचारी भावों (क्षणिक मनोदशाओं) के संयोग से रस की उत्पत्ति होती है। 

इस दृष्टि की सबसे बड़ी विशेषता यह है कि यह कला को केवल कलाकार का व्यक्तिगत प्रलाप नहीं मानती। यहाँ दर्शक या पाठक को ‘सहृदय’ कहा गया है—जिसका हृदय कलाकार के हृदय के साथ समान तरंग पर धड़कता हो। जब एक पाठक किसी मार्मिक प्रसंग को पढ़कर अश्रु बहाता है, तो वह केवल शोक का अनुभव नहीं कर रहा होता; वह उस व्यक्तिगत शोक का उदात्तीकरण करके 'करुण रस' के उस सार्वभौमिक आनंद तक पहुँचता है जो मानवीय संवेदना को परिष्कृत करता है।

## आधुनिक डिजिटल मीडिया में भाव की शून्यता
आज के सोशल मीडिया और डिजिटल इंटरफेस में सूचनाओं की भरमार है, लेकिन 'रस' का अभाव है। रील्स और शॉर्ट्स हमें उत्तेजित तो करते हैं, लेकिन हमारे भीतर किसी स्थायी भाव को जाग्रत नहीं कर पाते। भरतमुनि का रस सिद्धांत हमें याद दिलाता है कि सच्ची कला वही है जो दर्शक के भीतर एक गहरा, शांत और स्थायी अनुनाद छोड़ जाए।`
  },
  {
    id: 'essay_analog_craft_20',
    authorId: 'usr_kavita',
    title: 'The Weight of the Tool: Notes on Bookbinding and Manual Tactility',
    subtitle: 'Reflections from the bindery table on thread tension, bone folders, and why physical craft anchors human attention.',
    category: 'Design',
    language: 'en',
    daysAgo: 52,
    content: `There is a particular resistance that dried greyboard offers to a fresh scalpel blade. If you press too hard, the blade wanders and tears the fiber; if you press too lightly, you score without cutting. The artisan's hand learns to gauge the density through the fingertips, finding a balanced equilibrium that no automated CNC machine can replicate.

## The Anatomy of a Sewn Book
To fold sixteen sheets of paper into a signature, punch sewing stations with an awl, and link them across linen tapes using Irish waxed thread is to participate in an unbroken lineage of human craft that dates back to the Coptic monasteries of the fourth century.

A hand-bound book opens flat on a table with a willing, supple grace. The spine does not crack like a cheap, glue-bound commercial paperback. It possesses tactile presence: the grain of bookcloth, the deckled edge of handmade rag paper, the subtle deboss of hot-stamped metal foil.

## Tactility as an Antidote to Virtualization
We spend our working days sliding fingers across frictionless Gorilla glass. Every application feels identical: cold, smooth, and indifferent. Working with physical tools—bone folders, presses, glue pots, needle and thread—restores our connection to material friction. In an increasingly virtualized world, the handmade object reminds us that we have bodies, that matter is real, and that patience yields enduring beauty.`
  },
  {
    id: 'essay_bilingual_brain_21',
    authorId: 'usr_meera',
    title: 'The Polyglot Subconscious: What Happens When We Think Across Scripts',
    subtitle: 'How navigating multiple languages and writing systems simultaneously rewires human executive function and cognitive reserve.',
    category: 'Science',
    language: 'en',
    daysAgo: 54,
    content: `For the vast majority of Indians, monolingualism is an anomaly. A child growing up in Mumbai or Bengaluru navigates three or four languages before entering primary school: the mother tongue spoken with grandparents, the state language learned on the street, Hindi spoken with shopkeepers and film media, and English taught in schoolbooks.

## The Cognitive Gymnastics of Code-Switching
When a bilingual person speaks, both languages remain simultaneously active in the prefrontal cortex. The brain must constantly suppress the competing vocabulary of Language B while formulating a sentence in Language A. This continuous inhibitory control strengthens the brain's executive function networks, building significant cognitive reserve that delays the onset of dementia symptoms by four to five years compared to monolingual peers.

Furthermore, reading multiple scripts—for example, the phonetic, left-to-right alphasyllabary of Devanagari alongside the Latin alphabet or the right-to-left Nastaliq script of Urdu—activates distinct neural pathways in the visual word form area of the fusiform gyrus. The brain develops specialized recognition strategies for different graphemic densities.

## Thinking Beyond the Mother Tongue
Different languages illuminate different facets of emotional reality. Words like *jugaad*, *abhiman*, *sukoon*, or *viraha* carry philosophical textures that defy direct English translation. To live between languages is to understand that no single linguistic system possesses a monopoly on describing the human condition.`
  },
  {
    id: 'essay_open_protocols_22',
    authorId: 'usr_aditya',
    title: 'Walled Gardens vs. Open Plazas: The Battle for the Sovereign Web',
    subtitle: 'Why federated identity, RSS syndication, and decentralized data stores must supersede corporate mega-platforms.',
    category: 'Technology',
    language: 'en',
    daysAgo: 56,
    content: `In the early days of the World Wide Web, the dominant metaphor was the public square. Anyone with a $20 hosting account and a text editor could stake out a corner of cyberspace, publish their thoughts, and syndicate them worldwide via open protocols like HTTP, SMTP, and RSS.

## The Feudalization of Cyberspace
Over the past fifteen years, that open public plaza has been carved up by a handful of corporate landlord platforms. Today, millions of writers and creators live as digital sharecroppers, producing valuable literature inside proprietary walled gardens that dictate who sees their work through opaque, profit-maximizing algorithmic filters. If a platform alters its recommendation engine or bans an account, a creator's entire audience vanishes overnight.

We have traded digital sovereignty for the convenience of centralized feeds. But the cost has been catastrophic: rampant surveillance capitalism, algorithmic radicalization, and the erosion of healthy public discourse.

## The Return to Federated Standards
The solution is not to plead with corporate monopolies for benevolent moderation; it is to return to open, decentralized protocols. Technologies like ActivityPub, AT Protocol, and self-hosted RSS feeds prove that social networking can exist without centralized surveillance. In a sovereign web, you own your identity, your content archive, and your relationship with your readers.`
  },
  {
    id: 'essay_forest_rights_23',
    authorId: 'usr_arjun',
    title: 'Shadows on the Sal Trees: Community Forest Rights and Indigenous Sovereignty',
    subtitle: 'Field dispatches from central India on the struggle to reconcile conservation legislation with tribal land stewardship.',
    category: 'Culture',
    language: 'en',
    daysAgo: 58,
    content: `In the dense Sal forests of Bastar and Gadchiroli, the forest is not an untamed wilderness to be protected from humans; it is an ancestral home cultivated through centuries of indigenous knowledge.

## The Fallacy of Fortress Conservation
Colonial forestry laws in India were designed with a single objective: to extract timber for railway sleepers and naval shipbuilding while criminalizing traditional community access. Decades after independence, modern conservation bureaucracy often inherited this same "fortress conservation" mindset, treating forest-dwelling communities (*Adivasis*) as interlopers in their own ecosystems.

Yet empirical research across the globe consistently demonstrates that biodiversity outcomes are superior in community-managed forests compared to state-run wildlife sanctuaries. Indigenous communities understand rotational harvesting, controlled burning, and sacred grove (*deorai*) preservation. When a community holds recognized legal title under the Forest Rights Act (FRA), illegal commercial logging and poaching drop dramatically.

## Toward an Inclusive Ecology
True ecological conservation cannot be achieved by turning ancestral homelands into militarized tourist parks while displacing the very people whose cultural survival is inextricably linked to the forest. We must build a conservation paradigm that honors indigenous sovereignty, recognizing that human rights and ecological resilience are two sides of the same coin.`
  },
  {
    id: 'essay_sanctuary_of_words_24',
    authorId: 'usr_harsh',
    title: 'The Sanctuary of Words: Building READORA for Slow Thought',
    subtitle: 'Why we created an independent reading and writing home for India, and what it means to choose depth over velocity.',
    category: 'Philosophy',
    language: 'en',
    daysAgo: 60,
    content: `We built READORA because we were exhausted by the noise.

## The Velocity Trap
Every contemporary publishing platform is locked in an escalating arms race for dopamine. Posts must be brief; titles must be sensational; metrics must flash in real time; comment sections must descend into algorithmic combat. The result is a media ecosystem that leaves both writers and readers feeling depleted, anxious, and intellectually unanchored.

We asked ourselves: What if a platform was designed like an ancient library or a quiet reading room? What if the background was warm paper rather than glaring white? What if typography was treated with the dignity of classical letterpress? What if there were no like counters flashing, no tracking cookies, and no infinite doom-scroll?

## Where Readers Become Creators
READORA is founded on the belief that reading and writing are reciprocal sacred acts. Deep reading requires patience, silence, and attention. Thoughtful writing demands courage, revision, and craft.

We built this platform for Indian thinkers, philosophers, coders, poets, and historians who want to explore long-form essays that will matter ten years from now. Thank you for entering this quiet sanctuary. We invite you to sit back, breathe, read deeply, and when ready—write.`
  }
];

// Curated follow pairings to create real follower/following graph
const FOLLOW_PAIRS = [
  ['usr_ananya', 'usr_rohan'],
  ['usr_ananya', 'usr_sameera'],
  ['usr_ananya', 'usr_arvind'],
  ['usr_ananya', 'usr_priya'],
  ['usr_rohan', 'usr_ananya'],
  ['usr_rohan', 'usr_aditya'],
  ['usr_rohan', 'usr_kavita'],
  ['usr_rohan', 'usr_harsh'],
  ['usr_sameera', 'usr_devika'],
  ['usr_sameera', 'usr_farhan'],
  ['usr_sameera', 'usr_ananya'],
  ['usr_vikram', 'usr_arjun'],
  ['usr_vikram', 'usr_arvind'],
  ['usr_vikram', 'usr_meera'],
  ['usr_priya', 'usr_ananya'],
  ['usr_priya', 'usr_farhan'],
  ['usr_priya', 'usr_sunita'],
  ['usr_arjun', 'usr_vikram'],
  ['usr_arjun', 'usr_sameera'],
  ['usr_arjun', 'usr_harsh'],
  ['usr_kavita', 'usr_rohan'],
  ['usr_kavita', 'usr_devika'],
  ['usr_kavita', 'usr_sunita'],
  ['usr_farhan', 'usr_sameera'],
  ['usr_farhan', 'usr_priya'],
  ['usr_meera', 'usr_ananya'],
  ['usr_meera', 'usr_arvind'],
  ['usr_aditya', 'usr_rohan'],
  ['usr_aditya', 'usr_harsh'],
  ['usr_sunita', 'usr_ananya'],
  ['usr_sunita', 'usr_priya'],
  ['usr_sunita', 'usr_farhan'],
  ['usr_arvind', 'usr_ananya'],
  ['usr_arvind', 'usr_meera'],
  ['usr_arvind', 'usr_vikram'],
  ['usr_devika', 'usr_sameera'],
  ['usr_devika', 'usr_kavita'],
  ['usr_harsh', 'usr_ananya'],
  ['usr_harsh', 'usr_rohan'],
  ['usr_harsh', 'usr_sameera'],
  ['usr_harsh', 'usr_arvind']
];

async function seed() {
  console.log('🌱 Starting READORA Phase 2 Production Database Seeding...');
  await initDB();

  const defaultPasswordHash = await bcrypt.hash('readora123', 10);

  // 1. Seed Authors
  console.log(`\n👤 Seeding ${AUTHORS.length} Indian authors...`);
  for (const author of AUTHORS) {
    await db.runAsync(`
      INSERT INTO users (id, name, email, handle, password_hash, avatar, bio, website, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        handle = excluded.handle,
        bio = excluded.bio,
        website = excluded.website
    `, [
      author.id,
      author.name,
      author.email,
      author.handle,
      defaultPasswordHash,
      author.avatar,
      author.bio,
      author.website,
      pastDate(60)
    ]);
    console.log(`  ✓ Author: ${author.name} (${author.handle})`);
  }

  // 2. Seed Follow Graph (Composite primary key with check)
  console.log('\n🤝 Seeding social follow connections...');
  let followCount = 0;
  for (const [follower, followee] of FOLLOW_PAIRS) {
    if (follower === followee) continue;
    try {
      await db.runAsync(`
        INSERT INTO follows (id, follower_id, following_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, [
        `flw_${follower}_${followee}`,
        follower,
        followee,
        pastDate(Math.floor(Math.random() * 30) + 1)
      ]);
      followCount++;
    } catch(e) {}
  }
  console.log(`  ✓ Inserted ${followCount} follow relationships.`);

  // 3. Seed Essays
  console.log(`\n📚 Seeding ${ESSAYS.length} full-length essays in English and Hindi...`);
  const authorMap = new Map(AUTHORS.map(a => [a.id, a]));

  for (const essay of ESSAYS) {
    const author = authorMap.get(essay.authorId) || AUTHORS[0];
    const wordCount = (essay.content.match(/\S+/g) || []).length;
    const readTime = `${Math.max(1, Math.ceil(wordCount / 180))} min read`;
    const createdAt = pastDate(essay.daysAgo);

    await db.runAsync(`
      INSERT INTO posts (
        id, type, author_id, author_name, author_handle, author_avatar,
        title, subtitle, content, category, read_time,
        likes_count, bookmarks_count, views_count, created_at, language
      )
      VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        subtitle = excluded.subtitle,
        content = excluded.content,
        read_time = excluded.read_time,
        category = excluded.category,
        language = excluded.language
    `, [
      essay.id,
      author.id,
      author.name,
      author.handle,
      author.avatar,
      essay.title,
      essay.subtitle,
      essay.content,
      essay.category,
      readTime,
      Math.floor(Math.random() * 120) + 15,
      Math.floor(Math.random() * 65) + 10,
      Math.floor(Math.random() * 2500) + 300,
      createdAt,
      essay.language || 'en'
    ]);

    // Also populate FTS5 index if table exists
    try {
      await db.runAsync(`
        INSERT INTO posts_fts (id, title, subtitle, content, category, author_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        essay.id,
        essay.title,
        essay.subtitle,
        essay.content,
        essay.category,
        author.name
      ]);
    } catch(e) {}

    console.log(`  ✓ [${essay.category}] "${essay.title.substring(0, 48)}..." by ${author.name} (${wordCount} words)`);
  }

  console.log('\n======================================================');
  console.log('🎉 READORA Phase 2 Seeding Completed Successfully!');
  console.log(`   Authors: ${AUTHORS.length}`);
  console.log(`   Essays:  ${ESSAYS.length}`);
  console.log('   All timestamps formatted in UTC, dates within past 60 days.');
  console.log('======================================================\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed with error:', err);
  process.exit(1);
});

