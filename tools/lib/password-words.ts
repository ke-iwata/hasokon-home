/**
 * パスフレーズ用の単語リスト（完全自作）
 *
 * 仕様: docs/features/password-seisei.md
 *
 * **外部の単語リストを転用・訳出していない。** 日本語の一般名詞（公知の普通名詞のみ。
 * 固有名詞・商標・人名は入れない）をローマ字にして自前で作ったものなので、
 * ライセンス表記は不要で、配布・改変にも制約がない。
 * 参考にしたのは**方式だけ**——「語数とエントロピーの関係」という公知の計算方法で、
 * 既存リスト（EFF Large Wordlist など）の中身は参照していない。
 *
 * ## 語数を 2048 ちょうどにしてある理由
 *
 * 2048 = 2^11 なので、**1語がちょうど11ビット**になる。
 * 4語で44ビット、6語で66ビット、と暗算できるほうが、
 * 画面の説明とFAQで扱いやすい（半端な語数だと log2(1873) のような数になる）。
 *
 * ## 収録の基準（tests/password-words.test.ts が固定している）
 *
 * - 語数はちょうど 2048。重複・空文字なし
 * - 使う文字は英小文字（a〜z）だけ。長さは4〜9文字
 *   （3文字の語は「kaki / kagi / kami」のように紛らわしい組が急増するので入れていない）
 * - **1文字違い（同じ長さでハミング距離1）の相手が4語以上ある語を入れない。**
 *   ローマ字の日本語は「kaki・kaku・kako…」のように1文字違いが自然に生まれるため
 *   ゼロにはできない。できるのは「1つの語のまわりに紛らわしい語が集まること」を
 *   止めることで、上限を3語にしてある
 *
 * 語を足すときは上の基準をテストが見張っているので、npm test を通してから入れること。
 * **語数を変えると1語あたりのビット数が半端になる**ので、足すなら同時に減らす。
 */

/**
 * 単語の実体。1語ずつ配列に書くと1500行を超えて読みにくいので、
 * 空白区切りの文字列を分解している（辞書ファイルとしてそのまま読める形）。
 */
const RAW = `
abura aemono agemono ahiru aikido aironkake aisatsu aisu
ajisai akachan akatsuki akikaze akogare akubi akuseru amagasa
amami amanattou amazake amimono amimoto anago anki annai
anpu anshin ansho anzen anzu aosa apaato arare
arashi arerugi arubamu asaban asagao asagiiro asagiri asagohan
asahi asari asatte asayake ashi ashiba ashikubi ashimoto
ashita asobi atama atsusa awabi azarashi azuki bagen
baggu baindaa baiorin bairitsu baishou baiten baketsu banana
bangohan bangumi bara barebo barere barukoni basho basu
basuke basutei bataa batta batterii baziru beddo bekon
bengoshi beniiro benkyou bentou beranda beruto besuto bideo
bihada biiru bijutsu bijutsuka binsen biru biskeeto bitamin
biwa biza bokujou bokusou bonchi boonasu boorupen boru
botan boufuu bouhan bouhi bousai boushi boushiami bouto
buchou budou buhin bukuro buna bunbetsu bunka bunkasai
bunkazai bunko bunpou bunshou bunsui bunsuu burando buranko
burashi burauza bureeki buri burokku buroochi buta butai
butaniku butsuri buyou byou byoubu byouin byouki chahan
chairo chansu chawan chekku chero chichi chigaku chihei
chihou chiiki chiizu chikara chikin chikusan chikuwa chikyuu
chikyuugi chimu chirashi chiri chiryou chishiki chisso chizu
chokin chokki chokoku chokusen chooku chouchin chourishi chouryoku
chuui chuumon chuuou chuurippu chuusei chuusha chuushin chuushou
dagashi daichi daidokoro daifuku daigaku daikei daikin daikon
daizu dakkoku danboru danbou danchi dango dansaa danso
dansu dantai dashi deai deeta denatsu denchi dengen
denki denkyuu dennwa denryoku denryuu densha dentaku dentou
denwa depaato dessan dezaato dezain dojou dokusho dokushoka
dokushou donburi donguri doraibaa doraiyaa doramu dorayaki doresu
doria doro doryoku doryou dosei dosha dougu doukutsu
dounatsu douro doyou edamame egao ehon eiga eigakan
eigo eikyou eiyou eizou ekiden enchuu endou enerugi
engawa engeki enjin enkei enogu enoki enpitsu ensoku
ensou ensui entotsu enzetsu erebeeta eringi fairu fakkusu
fasunaa ferii firumu fooku foruda fuan fubuki fuchi
fude fudebako fugu fuji fukasa fuku fukuro fukurou
fukushuu fukutsuu fumikiri funa funka furaipan furikomi furoba
furoshiki furuhon furuuto fusen fusuma futon fuufu fuukei
fuurin fuusen fuusha fuutou fuyu gachou gaikoku gake
gakkou gakkyuu gakubuchi gakufu gakumon gakusei gakushuu gamen
gamu gamuteepu ganseki gara gasorin gasshou gazou geijutsu
geinin gekijou gekkanshi genba genjitsu genkan genki genkin
genmai gennin genryou genzai genzei genzou geshi getsuyou
giin giitaa gijutsu gimu ginga ginkou girei girita
giron gobou gogatsu gohan gokiburi goma gomibako gorira
goya gunjou gurafu guramu gurasu gutairei gyogyou gyokuro
gyosen gyouji gyousei gyouza gyuudon gyuuniku gyuunyuu habatobi
haburashi hachiue hada hagaki hagi haguruma haha haiboku
haihiiru haikingu haiku hairo haisou haitatsu haiyuu hajime
hakama hakari hakike hakken hako hakuchou hakumai hakusai
hamachi hamaguri hamigaki hamoni hamu hanagara hanakago hanami
hanamizu hanashi hanataba hanawa hanaya hanbaagaa hanbai hanbun
handoru hanei hanetsuki hanga hangaa hangetsu hanketsu hanshi
hantoshi hantou haori happa happyou hare hari harukaze
harusame hasami hashigo hashira hatake hato hatsuden hatsumei
hattatsu hatten hausu hayashi hebi hedohon heijitsu heikou
heiya henji henka herumetto heso heya hibachi hibana
hibari hidari hidokei hifu higai higasa higashi hige
hiji hijiki hikari hikidashi hikishio hikiwake hikizan hikouki
himawari himitsu himo hina hinan hinanjo hinode hinoiri
hinoki hinshitsu hiragana hirame hiroba hirosa hiru hirugohan
hiryou hishigata hitai hitode hitomi hitsuji hiyou hiza
hodou hogosha hoiiru hoikuen hoken hokku hokuro hokusei
hokutou homu hondana hone honoo hontou honya hooru
horei horensou hoshi hoshizora hosho hosomichi hosshin hotaru
hotate hoteru houdou hougaku houhou houi houjicha houki
houkoku houritsu houtei hozen hozon hyaku hyou hyoujou
hyouka hyouron hyoushiki ibiki ichiba ichibu ichido ichigatsu
ichigo ichijikan ichijiku ichinen ichinichi ichou ifuku igaku
ikada ikari ikesu ikkodate imori imouto inaka inazuma
inekari ingen inkan inko inochi inoshishi ippon ippun
irasuto iruka iseki isha ishibashi isobe itachi itame
itami itoko itomaki iwashi iyaringu izakaya izen izumi
jaaji jagaimo jaketto jakki jichi jidai jiden jidou
jidouka jidousha jiinzu jijitsu jikan jikken jiko jimu
jimusho jinja jinzou jishin jisho jissen jiten jitensha
joggingu jougi jouhou jouka jourei jouro joushi jouzai
joyuu jugyou jukai juken junban junbi junsa jushinki
jutaku juudou juugatsu juumin juusu kaadigan kaado kaaten
kaban kabin kabocha kabosu kabu kachiku kachou kadan
kaden kadomatsu kaede kaeru kafunshou kagaku kagami kage
kagibari kagitaba kaidan kaiga kaigan kaigara kaigi kaihatsu
kaiho kaijou kaikaku kaikei kaiketsu kaimono kairo kaisatsu
kaisha kaisuu kaitou kaiwa kaiware kaizen kaji kajitsu
kakaku kakato kakebuton kakedokei kakei kakejiku kakezan kakikomi
kako kakudo kakurenbo kakushin kakutei kakuteru kamaboko kamera
kami kaminari kaminoke kamisori kamo kamome kamoshika kamotsu
kanamono kanashimi kanazuchi kanban kanbatsu kane kangae kangaruu
kangoshi kanji kankei kankou kankyou kanmi kanna kanousei
kanran kansatsu kansha kanshi kanshin kansou kansoubun kansouki
kantoku kanuu kanzashi kanzou kanzume kaori kappa kappu
karada karami karashi karasu karate karee kareha kareraisu
kariudo karuta kasa kasei kasetsu kashu kasutera katakana
katazuke katei katsudon katsuo katsuyou kattaa kawa kawabe
kawagutsu kayou kayumi kazan kaze kazoku kazu kechappu
keeburu keeki kega keibiin keikaku keiken keikoutou keiri
keisan keisatsu keitai keito keiyaku kekka kekkan kemuri
kenbikyou kenchiku kendama kendou kenkou kenkyuu kenri kensa
keshigomu keshiki keshou keshouhin keshousui keta ketsuatsu ketsueki
keyaki kiatsu kiba kibou kibun kigen kihon kiiboodo
kiiro kijun kikai kikaku kikanshi kiken kiku kikurage
kikyuu kimochi kimono kimuchi kinako kinen kinenbi kingendai
kinjo kinniku kinoko kinou kinri kinsei kinu kinyou
kioku kion kippu kiri kirin kiro kiroku kiryoku
kisetsu kisha kishou kisoku kissaten kita kitsune kitte
kiui kiwi kiyomizu koara kobune kodai kodomo kofun
kogarashi koinu kojou koke kokkai kokoa kokonatsu kokoro
kokuban kokugo kokumin kokumotsu kokusai kokusaika kokyaku kokyuu
komatsuna kombu kome komugi kona konbea konbini kondate
koneko konpou konpyuuta konsaato konsento konsui kontakuto koodo
koohii koori koorogi kooto koppu kosame koshou kossetsu
kosumosu kotae kotatsu kotoba kouban koucha kouchi kouen
kougai kougaku kougen kougu kougyou kouhai kouhi kouji
koujou koukiatsu koukou kouminkan koumori kounyuu koura kousa
kousatsu kousei kouseki kousoku kousui koutei kouza kouzan
kouzui koya kozeni kozue kubi kubiwa kuchi kuchibeni
kuchibiru kuchibue kudamono kufuu kugatsu kugi kujaku kujira
kukkii kumo kumori kuni kurage kurashi kurasu kurattchi
kurein kuripu kuro kurozetto kuruma kurumi kusa kusahara
kusairo kushami kushi kushiyaki kusunoki kusuri kusuriya kutsu
kuuchou kuuki kuukou kuwa kuwagata kyabetsu kyakuhon kyakuseki
kyakusen kyakusha kyampu kyanbasu kyatatsu kyoku kyokusen kyou
kyoudai kyouiku kyouju kyoukai kyoukasho kyoumi kyouryuu kyoushi
kyuudou kyuujitsu kyuujo kyuujou kyuuka kyuukei kyuukon kyuuri
kyuuryou kyuusu kyuuyo maagarin mabuta machi machinami mado
madoguchi mafuraa magma mago magunetto maguro mahiru maiasa
maiban maiku mainen mainichi maishuu maitake maki makiba
makijaku maku makura mame manaa manabi manaita manga
mangetsu mango manjuu mannaka manshon manzoku marason masuku
masuto matcha matsu matsuge matsuri matsutake mattoresu mausu
mayoneezu mayu meeru meetoru megane meibutsu meiro meisho
meisui mejiro memai memo menbou menkyo menyuu merodi
meron mezamashi michishio midori migi migiwa mikan mikazuki
miki mimi mimikaki mimizu minami minamo minato mine
minshuku minto minzoku mirai mirin miruku misaki mise
mishin miso mitsuba miyage mizu mizube mizugiwa mizuiro
mizusashi mizutama mizuumi mizuyari mochi mochigome mogura moji
mokkin mokugyo mokuhyou mokusei mokuteki mokuyou momiji momo
momoiro monaka mondai monitaa mono monooki monosashi mopu
mori moufu moya moyashi mozuku mugi mugicha mukade
mukai mukashi mukudori mune mura murasaki mure musen
musenki mushi mushikago musuko musume myaku myouga nabe
nadare nagagutsu nagame nagare nagasa naginata nagisa naifu
naikaku nairon naiyou nakama nakayoshi naki namako namazu
nameko namekuji namida nanohana nansei nantou nasu natsu
nattou nawa nawatobi nazonazo nedan negai negi negoto
neji nejiyama neko nekutai nemaki nemoto nemuke nendai
nendo nenza netsu netto nezame nezumi nichijou nichiyou
nido nigami nigatsu nihonshu niji nikki nikomi niku
nikuya nimono nimotsu ningyou ninjin ninniku nintai nioi
nira nishi nishin niwa niwasaki niwatori nochi nodo
nohara nokogiri nomi noren nori noriba noto nougyou
nouka nouryoku nouzei nuibari nuigurumi nuime nuka nuki
nukumori numa nuno nunoji nyuueki nyuugaku nyuuin nyuujou
nyuukoku nyuumon nyuusu nyuuyoku oashisu obasan obon ocha
oden odori odoroki ohajiki ojisan okama okane okara
okashi okawari okimono okura omiyage omocha omoi omoide
omoiyari omosa omuretsu ondokei ongaku ongakuka ongakukai onigiri
onigokko onpu onsei onsen ooame oobune oodouri ookami
ootobai orenji origami orimono oroshiuri orugan oshiire otedama
otona ototoi otouto ouyou owari oyako oyakodon oyatsu
oyayubi ozon pajama panda panya papaiya paretto parseri
pasokon pasupooto pasuta pazuru peepaa penchi pengin piano
piasu piiman pinku piza posuto puragu purin purinta
puuru ragu raibu raion rajio rakkyou rakuda ramen
ramune randoseru ranningu ranpu reesu reibou reigai reigi
reihaido rein reinkooto reitou reitouko reizouko reji rekishi
remon renge renkon renkyuu renraku renshuu renzu reshiito
reshipi ressha resutoran retasu retsu rieki rika ringo
ringyou rinsu riree riron risaikuru rishi risou risshun
risshuu risu rittoru riyuu rizumu robotto roka roketto
rokugatsu rokuon romaji romen ronbun ronri rouka rousoku
rozumari ruuru ruuzu ryokan ryokou ryokucha ryokuchi ryou
ryoukin ryouri ryourinin ryoushi ryukku ryuusei saba sabaku
sabun sagi sagyou sahou saiban saidaa saifu saigai
saigo saikai saikin saikoro sain sainou saisho saito
saji sakana sakanaya sake sakebi sakka sakkaa sakubun
sakura sakuranbo sakusen same sanbun sandaru sandou sangatsu
sangurasu sankaku sankousho sanma sanpaku sanpo sansho sanshouo
sanso sansuu sanyaku sarada saru sasa sasayaki sashimi
satoimo satou satsu satsuei satsueijo sauna sazae seibi
seibutsu seichou seifuku seihin seihoukei seiji seijouki seikatsu
seiki seikou seimai seiseki seisuu seitai seiten seito
seiton seizou seki sekinin sekken semi sempai senaka
senbei sencha senchi senkyo senmenjo senmon senro senryuu
senshu sensu sensuikan sentaku sentakuki sentou senzai serori
setsubun setsumei shachou shadou shain shakai shaken shakkin
shakkuri shako shakou shakunage shanpuu shapen shashin shashinka
shashou shatsu shazai shiai shiba shibai shibou shichuu
shida shifuto shigatsu shigen shigoto shigure shigusa shiika
shiiku shiitake shiitsu shijimi shijin shikaku shiken shiki
shikishi shimauma shimeji shimi shimin shimizu shimo shinbun
shinchou shingetsu shingou shinjitsu shinka shinkan shinkei shinkoku
shinkyuu shinpan shinpo shinrai shinrin shinsatsu shinseki shinsetsu
shinsho shinyou shinzou shio shiokara shiokaze shiori shippai
shippo shippu shirabe shirakaba shirami shiroppu shiru shiruku
shiryoku shiryou shisei shishamo shishutsu shishuu shiso shita
shitagi shitajiki shitaku shitsuchi shitsudo shitsugen shitsumon shiwa
shiyou shizen shokkan shokki shokuba shokudana shokudou shokuji
shokutaku shomei shomotsu shorui shoten shoubou shoubu shouchuu
shoudan shouga shougatsu shougen shougi shougyou shouhin shouhisha
shouji shouken shouko shoumei shoumeigu shourai shouri shousetsu
shousuu shouten shouyo shouyu shudan shukudai shukuhaku shunbun
shungiku shunin shusseki shuu shuubun shuuchuu shuuhen shuui
shuukaku shuukan shuumai shuumatsu shuunyuu shuuraku shuuri sobo
sofa sofu sokutei songai sonshitsu sonzai soosu sora
soramame soshiki soto sotsugyou souchi souda soudan sougen
souji souko souseeji soushinki suberidai subete sudachi sudare
suicchi suichoku suiei suigen suihanki suihei suijunki suika
suimin suiri suiro suisai suisaiga suiseigun suisen suisha
suishin suisou suitchi suiyou suji sukaafu sukaato sukecchi
sukeeto sukii sukiyaki sukoa sukoppu sukuriin sukuryuu sukyana
sumai sumi sumiiro sumika sumire sumou suna sunaba
sunadokei sunahama sune suniikaa sunobo sunomono supagetti supaisu
supana supattsu supiichi supiikaa supotsu supuun surippa sushi
susuki sutando sutereo sutokku sutoobu suugaku suuji suupaa
suupu suutsu suzukaze suzume suzumushi suzuri tabi taido
taifuu taihi taiiku taiikukan taiin taijuu taiki taiko
taion tairyoku taisaku taisou taisougi taiya taiyaki taiyou
taka takasa takatobi takenoko takibi takkyuu tako takoage
takuan takuhai takushii tamago tamanegi tana tanabata tanbarin
tanbo tanemaki tanemomi tango tani tanima tanjoubi tanka
tanken tanni tanpopo tansu tanuki tanzaku taoru tashizan
tasogare tatami tate tatemono tatsumaki taue tawashi teate
tebukuro teepu tegami teian teikiatsu teikiken teikou tejun
tekkin tekubi tempo tendon tengusa tenisu tenjikai tenjou
tenki tenmon tenmondai tenohira tenpo tenpura tensuu tenugui
tera terebi tesage tesuto tetsubou tetsukyou tiishatsu tisshu
tobira tochi tochuu todana toge tokage tokei toki
tokonoma tokubai tokuten tomato tomodachi tonakai tonari tonbo
tonkatsu tonneru tonnu toohyou tora torakku toranpu toreningu
torihiki torii toriniku toshi tosho toshokan tote touban
toufu touhyou touji touki tousutaa tozan tsuba tsubaki
tsubame tsubasa tsubomi tsuchi tsugumi tsukare tsukemono tsuki
tsukikage tsukimi tsukiyo tsukue tsukune tsume tsumekiri tsumiki
tsuna tsunagari tsunami tsurara tsuri tsuribito tsuribune tsurizao
tsuru tsutsuji tsutsumi tsuuchou tsuuhou tsuushin tsuya tsuyu
tsuzuki uchiawase uchiwa uchuu udedokei udewa udon ueki
uekibachi uguisu uisukii uketsuke ukibukuro ukiwa umami umeboshi
umibe unadon unagi undou undoujou undoukai untenshu uriage
uroko usagi ushi ushiro uuru uwagi wadai wafuku
wagashi wain waishatsu waka wakaba wakai wakame wakare
wakimizu wakuchin wakusei wani wanpiisu warai waraji wariai
waribiki warizan wasabi washi washitsu wata yabu yado
yagi yakan yakedo yakimono yakiniku yakitori yakkyoku yakugaku
yakusho yakusoku yakyuu yama yamaimo yamamichi yami yamiyo
yamori yanagi yane yaneura yaoya yarikata yasai yasashisa
yashi yashoku yasumi yasuri yatai yoake yoga yohou
yokin yoko yokusou yonaka yorokobi yoru yosan yoshuu
yotei yotto youchien youfuku yougan youguruto youkan youkashi
youshitsu youshoku yoyaku yozora yuba yubiwa yuga yukata
yuki yume yunomi yuri yutanpo yuubin yuudachi yuuenchi
yuugata yuuhi yuuki yuukyuu yuuyake yuwakashi yuzu zabuton
zaiko zairyou zaisei zakka zakuro zangyou zaru zasshi
zeikin zeisei zenbu zenpou zensai zensen zerii zoukin
zouri zubon zuhyou zuihitsu zukan zukin zukkiini zutsu
`;

/** パスフレーズに使う単語。読み取り専用で公開する */
export const PASSPHRASE_WORDS: readonly string[] = Object.freeze(RAW.trim().split(/\s+/));

/**
 * 1語あたりのエントロピー（ビット）。
 * 語数が 2048 なら log2(2048) = 11 ちょうどになる。
 */
export const BITS_PER_WORD = Math.log2(PASSPHRASE_WORDS.length);
