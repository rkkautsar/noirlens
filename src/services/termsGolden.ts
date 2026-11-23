/**
 * Golden paired translations for the lookup-term detector. Each expected
 * string must appear verbatim in the translated text; these are the proper
 * nouns / dish names / place names a reader would want to look up.
 */
export interface TermsGoldenCase {
  id: string;
  language: string;
  blocks: string[];
  translatedText: string;
  expected: string[];
  /** Substrings (prices) that must win over lookup spans in the eval. */
  prices?: string[];
}

export const TERMS_GOLDEN: TermsGoldenCase[] = [
  {
    id: 'banh-mi-phuong',
    language: 'vi',
    blocks: ['Bánh mì Phượng'],
    translatedText: "We stopped for lunch at Bánh mì Phượng before walking through Hoi An's old town.",
    expected: ['Bánh mì Phượng'],
  },
  {
    id: 'pho-thin',
    language: 'vi',
    blocks: ['Phở Thìn'],
    translatedText: 'Locals queue early for a bowl at Phở Thìn on Le Van Huu Street.',
    expected: ['Phở Thìn'],
  },
  {
    id: 'ca-phe-giang',
    language: 'vi',
    blocks: ['Cà phê Giảng'],
    translatedText: 'The egg coffee at Cà phê Giảng is a Hanoi institution.',
    expected: ['Cà phê Giảng'],
  },
  {
    id: 'bun-cha-huong-lien',
    language: 'vi',
    blocks: ['Bún chả Hương Liên'],
    translatedText: "Our guide took us to Bún chả Hương Liên for dinner.",
    expected: ['Bún chả Hương Liên'],
  },
  {
    id: 'cho-ben-thanh',
    language: 'vi',
    blocks: ['Chợ Bến Thành'],
    translatedText: 'Souvenirs are cheapest inside Chợ Bến Thành in District 1.',
    expected: ['Chợ Bến Thành'],
  },
  {
    id: 'nha-hang-ngon',
    language: 'vi',
    blocks: ['Nhà hàng Ngon'],
    translatedText: 'A friend recommended Nhà hàng Ngon for its courtyard seating.',
    expected: ['Nhà hàng Ngon'],
  },
  {
    id: 'le-jules-verne',
    language: 'fr',
    blocks: ['Le Jules Verne'],
    translatedText: 'Dinner at Le Jules Verne comes with a view over Paris.',
    expected: ['Le Jules Verne'],
  },
  {
    id: 'cafe-de-flore',
    language: 'fr',
    blocks: ['Café de Flore'],
    translatedText: 'Writers once gathered at Café de Flore on the Left Bank.',
    expected: ['Café de Flore'],
  },
  {
    id: 'musee-d-orsay',
    language: 'fr',
    blocks: ["Musée d'Orsay"],
    translatedText: "The clock gallery at Musée d'Orsay is worth the queue.",
    expected: ["Musée d'Orsay"],
  },
  {
    id: 'boulangerie-utopie',
    language: 'fr',
    blocks: ['Boulangerie Utopie'],
    translatedText: 'Their croissants from Boulangerie Utopie sell out by noon.',
    expected: ['Boulangerie Utopie'],
  },
  {
    id: 'el-xampanyet',
    language: 'es',
    blocks: ['El Xampanyet'],
    translatedText: 'We ended the night at El Xampanyet with cava and anchovies.',
    expected: ['El Xampanyet'],
  },
  {
    id: 'la-boqueria',
    language: 'es',
    blocks: ['La Boqueria'],
    translatedText: 'Stalls inside La Boqueria open early on weekdays.',
    expected: ['La Boqueria'],
  },
  {
    id: 'museo-del-prado',
    language: 'es',
    blocks: ['Museo del Prado'],
    translatedText: "The Goya rooms at Museo del Prado are upstairs.",
    expected: ['Museo del Prado'],
  },
  {
    id: 'trattoria-da-enzo',
    language: 'it',
    blocks: ['Trattoria da Enzo'],
    translatedText: 'A colleague booked Trattoria da Enzo for Friday.',
    expected: ['Trattoria da Enzo'],
  },
  {
    id: 'all-antico-vinaio',
    language: 'it',
    blocks: ["All'Antico Vinaio"],
    translatedText: "Students line up at All'Antico Vinaio for the schiacciata.",
    expected: ["All'Antico Vinaio"],
  },
  {
    id: 'hofbrauhaus',
    language: 'de',
    blocks: ['Hofbräuhaus'],
    translatedText: 'The tour ends at Hofbräuhaus with a liter of beer.',
    expected: ['Hofbräuhaus'],
  },
  {
    id: 'kathe-kollwitz-museum',
    language: 'de',
    blocks: ['Käthe Kollwitz Museum'],
    translatedText: 'A small room in Käthe Kollwitz Museum holds her drawings.',
    expected: ['Käthe Kollwitz Museum'],
  },
  {
    id: 'jay-fai',
    language: 'th',
    blocks: ['Jay Fai'],
    translatedText: 'Reservations at Jay Fai are hard to get.',
    expected: ['Jay Fai'],
  },
  {
    id: 'chatuchak-market',
    language: 'th',
    blocks: ['Chatuchak Market'],
    translatedText: 'Vintage stalls fill Chatuchak Market every weekend.',
    expected: ['Chatuchak Market'],
  },
  {
    id: 'warung-nasi-ibu-imas',
    language: 'id',
    blocks: ['Warung Nasi Ibu Imas'],
    translatedText: 'Drivers stop at Warung Nasi Ibu Imas on the way north.',
    expected: ['Warung Nasi Ibu Imas'],
  },
  {
    id: 'jl-malioboro',
    language: 'id',
    blocks: ['Jl. Malioboro'],
    translatedText: 'Street musicians line Jl. Malioboro after sunset.',
    expected: ['Jl. Malioboro'],
  },
  {
    id: 'highlands-coffee',
    language: 'vi',
    blocks: ['Highlands Coffee'],
    translatedText: 'We waited out the rain at Highlands Coffee.',
    expected: ['Highlands Coffee'],
  },
  {
    id: 'vincom-center',
    language: 'vi',
    blocks: ['Vincom Center'],
    translatedText: 'The cinema inside Vincom Center is on the top floor.',
    expected: ['Vincom Center'],
  },
  {
    id: 'sai-gon',
    language: 'vi',
    blocks: ['Sài Gòn'],
    translatedText: 'My grandmother still calls the city Sài Gòn.',
    expected: ['Sài Gòn'],
  },
  {
    id: 'da-nang',
    language: 'vi',
    blocks: ['Đà Nẵng'],
    translatedText: 'The flight lands in Đà Nẵng before noon.',
    expected: ['Đà Nẵng'],
  },
  {
    id: 'da-lat',
    language: 'vi',
    blocks: ['Đà Lạt'],
    translatedText: 'Coffee farms surround Đà Lạt in the highlands.',
    expected: ['Đà Lạt'],
  },
  {
    id: 'rue-de-rivoli',
    language: 'fr',
    blocks: ['Rue de Rivoli'],
    translatedText: 'The shop on Rue de Rivoli closes at seven.',
    expected: ['Rue de Rivoli'],
  },
  {
    id: 'piazza-navona',
    language: 'it',
    blocks: ['Piazza Navona'],
    translatedText: 'We ate gelato on Piazza Navona at midnight.',
    expected: ['Piazza Navona'],
  },
  {
    id: 'plaza-mayor',
    language: 'es',
    blocks: ['Plaza Mayor'],
    translatedText: 'The Christmas market fills Plaza Mayor in December.',
    expected: ['Plaza Mayor'],
  },
  {
    id: 'alexanderplatz',
    language: 'de',
    blocks: ['Alexanderplatz'],
    translatedText: 'Trams rattle through Alexanderplatz all day.',
    expected: ['Alexanderplatz'],
  },
  {
    id: 'sushi-transliterated',
    language: 'ja',
    blocks: ['すしざんまい'],
    translatedText: 'The chain Sushizanmai stays open late in Tokyo.',
    expected: ['Sushizanmai'],
  },
  {
    id: 'gwangjang-transliterated',
    language: 'ko',
    blocks: ['광장시장'],
    translatedText: 'Vendors at Gwangjang Market sell mung bean pancakes.',
    expected: ['Gwangjang'],
  },
  {
    id: 'quanjude-transliterated',
    language: 'zh',
    blocks: ['全聚德'],
    translatedText: 'Tour groups book Quanjude for the duck.',
    expected: ['Quanjude'],
  },
  {
    id: 'sony-boundary',
    language: 'en',
    blocks: ['Sony'],
    translatedText: "A booth near Sony opened SonyCorp's new store.",
    expected: ['Sony'],
  },
  {
    id: 'acme-boundary',
    language: 'en',
    blocks: ['Acme'],
    translatedText: 'The label Acme is not Acmeville.',
    expected: ['Acme'],
  },
  {
    id: 'cafe-central-deaccented',
    language: 'de',
    blocks: ['Café Central'],
    translatedText: 'We met at Cafe Central for coffee.',
    expected: ['Cafe Central'],
  },
  {
    id: 'gimbap-priced-line',
    language: 'ko',
    blocks: ['김밥', 'Gimbap 2,500 won'],
    translatedText: 'For lunch we bought Gimbap 2,500 won.',
    expected: ['Gimbap'],
    prices: ['2,500 won'],
  },
  {
    id: 'com-in-welcome',
    language: 'vi',
    blocks: ['Cơm'],
    translatedText: 'A warm welcome comes with rice.',
    expected: [],
  },
  {
    id: 'banh-in-banquet',
    language: 'vi',
    blocks: ['Bánh'],
    translatedText: 'The banquet hall is upstairs.',
    expected: [],
  },
  {
    id: 'bun-bo-hue-buried',
    language: 'vi',
    blocks: ['Bún bò Huế'],
    translatedText:
      'After three hours on the train, we finally found a small stall serving Bún bò Huế near the market.',
    expected: ['Bún bò Huế'],
  },
  {
    id: 'banh-mi-huynh-hoa-mid',
    language: 'vi',
    blocks: ['Banh Mi Huynh Hoa'],
    translatedText:
      'The line outside Banh Mi Huynh Hoa wraps around the block by eight in the morning.',
    expected: ['Banh Mi Huynh Hoa'],
  },
  {
    id: 'las-du-fallafel-parenthetical',
    language: 'fr',
    blocks: ["L'As du Fallafel"],
    translatedText:
      "Our favorite stop (L'As du Fallafel) is closed on Saturdays, so we went elsewhere.",
    expected: ["L'As du Fallafel"],
  },
  {
    id: 'kaffeehaus-central-dashes',
    language: 'de',
    blocks: ['Kaffeehaus Central'],
    translatedText:
      'The old café — Kaffeehaus Central — reopened last spring after repairs.',
    expected: ['Kaffeehaus Central'],
  },
  {
    id: 'ichiran-cjk-mid',
    language: 'ja',
    blocks: ['一蘭'],
    translatedText:
      'At midnight we joined the queue at 一蘭 in Shinjuku for a bowl.',
    expected: ['一蘭'],
  },
  {
    id: 'thai-mid',
    language: 'th',
    blocks: ['ร้านเจ๊ไฝ'],
    translatedText:
      'The queue at ร้านเจ๊ไฝ starts before dawn on most days.',
    expected: ['ร้านเจ๊ไฝ'],
  },
];
