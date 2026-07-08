// Discord/Slack-style emoji shortcodes → real emoji, so owners can type
// ":sparkles:" anywhere they'd type it elsewhere. Applied as-you-type in the
// Settings editors and again when copy is resolved for the storefront (which
// also fixes shortcodes saved before this existed). Unknown codes pass
// through untouched.

const EMOJI: Record<string, string> = {
  // sparkle & shine
  sparkles: '✨', star: '⭐', star2: '🌟', dizzy: '💫', sparkler: '🎇', fireworks: '🎆',
  comet: '☄️', sun_with_face: '🌞', sunny: '☀️', crescent_moon: '🌙', full_moon: '🌕',
  rainbow: '🌈', zap: '⚡', boom: '💥', fire: '🔥', bulb: '💡', crystal_ball: '🔮',
  magic_wand: '🪄', gem: '💎', crown: '👑',
  // hearts
  heart: '❤️', hearts: '💕', two_hearts: '💕', sparkling_heart: '💖', heartpulse: '💗',
  heartbeat: '💓', revolving_hearts: '💞', gift_heart: '💝', cupid: '💘', broken_heart: '💔',
  purple_heart: '💜', blue_heart: '💙', green_heart: '💚', yellow_heart: '💛',
  orange_heart: '🧡', black_heart: '🖤', white_heart: '🤍', brown_heart: '🤎',
  pink_heart: '🩷', heart_hands: '🫶',
  // nature & cute
  cherry_blossom: '🌸', blossom: '🌼', hibiscus: '🌺', sunflower: '🌻', rose: '🌹',
  tulip: '🌷', bouquet: '💐', four_leaf_clover: '🍀', herb: '🌿', leaves: '🍃',
  seedling: '🌱', mushroom: '🍄', maple_leaf: '🍁', snowflake: '❄️', butterfly: '🦋',
  bee: '🐝', honeybee: '🐝', ladybug: '🐞', snail: '🐌', turtle: '🐢', frog: '🐸',
  cat: '🐱', dog: '🐶', bear: '🐻', panda_face: '🐼', fox_face: '🦊', rabbit: '🐰',
  hamster: '🐹', mouse: '🐭', unicorn: '🦄', dragon: '🐉', ghost: '👻', alien: '👽',
  octopus: '🐙', axolotl: '🦎', duck: '🦆', penguin: '🐧', owl: '🦉',
  // making & craft
  art: '🎨', paintbrush: '🖌️', crayon: '🖍️', pencil2: '✏️', memo: '📝', scissors: '✂️',
  thread: '🧵', yarn: '🧶', printer: '🖨️', robot: '🤖', gear: '⚙️', hammer_and_wrench: '🛠️',
  wrench: '🔧', test_tube: '🧪', teddy_bear: '🧸', puzzle_piece: '🧩', game_die: '🎲',
  video_game: '🎮', dice: '🎲', jigsaw: '🧩',
  // shop & shipping
  package: '📦', gift: '🎁', ribbon: '🎀', shopping_cart: '🛒', shopping_bags: '🛍️',
  handbag: '👜', moneybag: '💰', dollar: '💵', credit_card: '💳', label: '🏷️',
  bookmark: '🔖', truck: '🚚', airplane: '✈️', rocket: '🚀', mailbox: '📫',
  mailbox_with_mail: '📬', incoming_envelope: '📨', envelope: '✉️', email: '📧',
  'e-mail': '📧', love_letter: '💌', bell: '🔔', mega: '📣', loudspeaker: '📢',
  speech_balloon: '💬', calendar: '📅', date: '📅', hourglass: '⏳', alarm_clock: '⏰',
  // celebration & food
  tada: '🎉', confetti_ball: '🎊', balloon: '🎈', partying_face: '🥳', birthday: '🎂',
  cake: '🍰', cupcake: '🧁', cookie: '🍪', candy: '🍬', lollipop: '🍭', chocolate_bar: '🍫',
  honey_pot: '🍯', strawberry: '🍓', cherries: '🍒', peach: '🍑', lemon: '🍋',
  watermelon: '🍉', coffee: '☕', tea: '🍵', bubble_tea: '🧋', jack_o_lantern: '🎃',
  christmas_tree: '🎄',
  // faces & hands
  smile: '😄', smiley: '😃', grin: '😁', wink: '😉', blush: '😊', heart_eyes: '😍',
  star_struck: '🤩', innocent: '😇', thinking: '🤔', melting_face: '🫠', wave: '👋',
  clap: '👏', raised_hands: '🙌', pray: '🙏', thumbsup: '👍', '+1': '👍',
  thumbsdown: '👎', '-1': '👎', ok_hand: '👌', point_right: '👉', point_left: '👈',
  point_down: '👇', point_up: '☝️', eyes: '👀', muscle: '💪', victory: '✌️', v: '✌️',
  // marks
  white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌', warning: '⚠️', new: '🆕',
  '100': '💯', pushpin: '📌', round_pushpin: '📍', link: '🔗', books: '📚', book: '📖',
  key: '🔑', lock: '🔒', wavy_dash: '〰️',
}

const SHORTCODE_RE = /:([a-z0-9_+-]+):/g

/** Replace known :shortcodes: with emoji; unknown codes are left alone. */
export function emojify(text: string): string {
  if (!text.includes(':')) return text
  return text.replace(SHORTCODE_RE, (match, name: string) => EMOJI[name] ?? match)
}
