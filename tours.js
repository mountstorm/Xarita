// Guided tours. Each stop sets the year, flies the map and seeds the maps panel
// with a search term the Library of Congress catalogue actually uses.
// Text fields are { en, uz, ru }.
window.TOURS = [
  {
    id: "silk-road",
    name: {
      en: "The Silk Road through Uzbekistan",
      uz: "Oʻzbekiston boʻylab Buyuk Ipak yoʻli",
      ru: "Великий шёлковый путь по Узбекистану",
    },
    blurb: {
      en: "From Alexander's Maracanda to independent Tashkent, in six stops.",
      uz: "Iskandarning Marakandasidan mustaqil Toshkentgacha, olti bekatda.",
      ru: "От Мараканды Александра до независимого Ташкента, за шесть остановок.",
    },
    stops: [
      {
        year: -329, center: [66.97, 39.65], zoom: 4.6, query: "Central Asia",
        title: { en: "Maracanda", uz: "Marakanda", ru: "Мараканда" },
        text: {
          en: "Alexander the Great reached the Sogdian city of Maracanda, now Samarkand, in 329 BC. Even then it was a crossroads, where caravans from China met traders from Persia.",
          uz: "Iskandar Zulqarnayn miloddan avvalgi 329-yilda Soʻgʻdiyonaning Marakanda shahriga, bugungi Samarqandga yetib keldi. U paytdayoq bu yer Xitoy karvonlari Fors savdogarlari bilan uchrashadigan chorraha edi.",
          ru: "Александр Македонский дошёл до согдийской Мараканды, нынешнего Самарканда, в 329 году до н. э. Уже тогда это был перекрёсток, где караваны из Китая встречались с персидскими купцами.",
        },
      },
      {
        year: 1400, center: [66.97, 39.65], zoom: 4.2, query: "Samarkand",
        title: { en: "Samarkand, Timur's capital", uz: "Samarqand, Amir Temur poytaxti", ru: "Самарканд, столица Тимура" },
        text: {
          en: "Timur made Samarkand the capital of his empire in 1370 and brought in craftsmen from the cities he conquered. Twenty years later his grandson Ulugh Beg started building on the Registan.",
          uz: "Amir Temur 1370-yilda Samarqandni oʻz saltanatining poytaxtiga aylantirdi va zabt etgan shaharlaridan hunarmandlarni olib keldi. Yigirma yildan soʻng nabirasi Mirzo Ulugʻbek Registonda qurilishni boshladi.",
          ru: "Тимур сделал Самарканд столицей своей империи в 1370 году и свёз туда мастеров из покорённых городов. Через двадцать лет его внук Улугбек начал строить на Регистане.",
        },
      },
      {
        year: 1600, center: [64.42, 39.77], zoom: 5, query: "Bukhara",
        title: { en: "Bukhara's caravanserais", uz: "Buxoro karvonsaroylari", ru: "Караван-сараи Бухары" },
        text: {
          en: "By 1600 the Khanate of Bukhara ruled the old Silk Road heartland. Merchants slept in caravanserais and traded under the domed bazaars, and both are still standing.",
          uz: "1600-yilga kelib Buxoro xonligi Ipak yoʻlining qadimiy markazini boshqarardi. Savdogarlar karvonsaroylarda tunab, gumbazli toqlar ostida savdo qilishardi. Ularning ikkalasi ham hozirgacha saqlanib qolgan.",
          ru: "К 1600 году Бухарское ханство правило самым сердцем Шёлкового пути. Купцы ночевали в караван-сараях и торговали под куполами торговых рядов, и те и другие стоят до сих пор.",
        },
      },
      {
        year: 1800, center: [60.36, 41.38], zoom: 5.4, query: "Khiva",
        title: { en: "Khiva behind its walls", uz: "Devorlar ortidagi Xiva", ru: "Хива за стенами" },
        text: {
          en: "The Khanate of Khiva sat in an oasis surrounded by desert. Its walled inner town, Itchan Kala, looks much as it did when European mapmakers were still guessing at the region.",
          uz: "Xiva xonligi choʻllar bilan oʻralgan vohada joylashgan edi. Uning devor bilan oʻralgan ichki shahri, Ichan qalʼa, yevropalik kartograflar bu hududni hali taxminan chizgan davrdagidek koʻrinadi.",
          ru: "Хивинское ханство лежало в оазисе посреди пустыни. Его обнесённый стеной внутренний город Ичан-Кала выглядит почти так же, как в те времена, когда европейские картографы рисовали этот край наугад.",
        },
      },
      {
        year: 1880, center: [69.24, 41.3], zoom: 4.6, query: "Turkestan",
        title: { en: "Tashkent under the tsars", uz: "Chor hukmronligidagi Toshkent", ru: "Ташкент при царях" },
        text: {
          en: "Russian troops took Tashkent in 1865, and from 1867 it was the capital of Russian Turkestan. Watch how the old khanates shrink into protectorates on the map.",
          uz: "Rus qoʻshinlari 1865-yilda Toshkentni egalladi va 1867-yildan u Turkiston general-gubernatorligining poytaxti boʻldi. Xaritada eski xonliklarning protektoratlarga aylanib qisqarishini kuzating.",
          ru: "Русские войска взяли Ташкент в 1865 году, а с 1867 года он стал столицей Туркестанского генерал-губернаторства. Посмотрите, как старые ханства сжимаются до протекторатов.",
        },
      },
      {
        year: 1994, center: [64.5, 41.4], zoom: 4.6, query: "Uzbekistan",
        title: { en: "Uzbekistan, home", uz: "Oʻzbekiston, ona yurt", ru: "Узбекистан, дом" },
        text: {
          en: "Uzbekistan became independent on 1 September 1991. Tashkent is the capital and, for the person who built this site, the best plov on the planet.",
          uz: "Oʻzbekiston 1991-yil 1-sentabrda mustaqillikka erishdi. Poytaxti Toshkent, bu saytni yaratgan odam uchun esa dunyodagi eng mazali osh shu yerda.",
          ru: "Узбекистан стал независимым 1 сентября 1991 года. Столица — Ташкент, а для автора этого сайта ещё и лучший плов на планете.",
        },
      },
    ],
  },
  {
    id: "mississippi",
    name: { en: "Mississippi, then and now", uz: "Missisipi: oʻshanda va hozir", ru: "Миссисипи: тогда и сейчас" },
    blurb: {
      en: "Spanish Natchez, the territory, Ole Miss, Vicksburg and 1962.",
      uz: "Ispan Natchezi, hudud davri, Ole Miss, Viksburg va 1962-yil.",
      ru: "Испанский Натчез, территория, Ole Miss, Виксберг и 1962 год.",
    },
    stops: [
      {
        year: 1783, center: [-91.4, 31.56], zoom: 5, query: "Natchez",
        title: { en: "Spanish Natchez", uz: "Ispan Natchezi", ru: "Испанский Натчез" },
        text: {
          en: "When the American Revolution ended, Spain still held Natchez on the bluffs of the Mississippi River. Spain and the United States argued over the border until 1798.",
          uz: "Amerika inqilobi tugaganda Missisipi daryosi qirgʻogʻidagi Natchez hali ham Ispaniya qoʻlida edi. Ispaniya va AQSh 1798-yilgacha chegara ustida bahslashdi.",
          ru: "Когда закончилась Американская революция, Натчез на обрывах Миссисипи ещё принадлежал Испании. Испания и США спорили о границе до 1798 года.",
        },
      },
      {
        year: 1815, center: [-89.6, 32.7], zoom: 4.8, query: "Mississippi Territory",
        title: { en: "Mississippi Territory", uz: "Missisipi hududi", ru: "Территория Миссисипи" },
        text: {
          en: "Congress organized the Mississippi Territory in 1798, and Mississippi became the 20th state in December 1817. Early maps of this period are full of Choctaw and Chickasaw lands.",
          uz: "Kongress 1798-yilda Missisipi hududini tashkil etdi va 1817-yil dekabrda Missisipi 20-shtatga aylandi. Bu davrning ilk xaritalarida Choktau va Chikaso yerlari koʻp uchraydi.",
          ru: "Конгресс образовал Территорию Миссисипи в 1798 году, а в декабре 1817 года Миссисипи стал 20-м штатом. На ранних картах этого времени много земель чокто и чикасо.",
        },
      },
      {
        year: 1848, center: [-89.52, 34.37], zoom: 5.5, query: "Mississippi",
        title: { en: "Ole Miss opens", uz: "Ole Miss ochiladi", ru: "Открытие Ole Miss" },
        text: {
          en: "The University of Mississippi opened in Oxford in 1848 with 80 students. Look for the railroad maps of this period: the line that ran through Oxford was still a plan on paper.",
          uz: "Missisipi universiteti 1848-yilda Oksfordda 80 nafar talaba bilan ochildi. Bu davrning temir yoʻl xaritalarini qidiring: Oksforddan oʻtadigan liniya hali faqat qogʻozdagi reja edi.",
          ru: "Университет Миссисипи открылся в Оксфорде в 1848 году, в нём было 80 студентов. Поищите железнодорожные карты того времени: линия через Оксфорд тогда существовала только на бумаге.",
        },
      },
      {
        year: 1863, center: [-90.88, 32.35], zoom: 5.5, query: "Vicksburg",
        title: { en: "Siege of Vicksburg", uz: "Viksburg qamali", ru: "Осада Виксберга" },
        text: {
          en: "Vicksburg surrendered on 4 July 1863 after a 47-day siege, and the Union took control of the Mississippi River. The Library of Congress has the military survey maps drawn during the siege.",
          uz: "Viksburg 47 kunlik qamaldan soʻng 1863-yil 4-iyulda taslim boʻldi va Ittifoq Missisipi daryosini nazoratga oldi. Kongress kutubxonasida qamal paytida chizilgan harbiy xaritalar saqlanadi.",
          ru: "Виксберг сдался 4 июля 1863 года после 47-дневной осады, и Союз взял под контроль реку Миссисипи. В Библиотеке Конгресса хранятся военные съёмочные карты, нарисованные во время осады.",
        },
      },
      {
        year: 1962, center: [-89.52, 34.37], zoom: 5.5, query: "Oxford Mississippi",
        title: { en: "Ole Miss, 1962", uz: "Ole Miss, 1962", ru: "Ole Miss, 1962" },
        text: {
          en: "In October 1962 James Meredith became the first Black student admitted to the University of Mississippi. Federal marshals and troops had to escort him onto campus. Hotty Toddy, and history.",
          uz: "1962-yil oktabrda Jeyms Meredit Missisipi universitetiga qabul qilingan birinchi qora tanli talaba boʻldi. Uni kampusga federal marshallar va askarlar kuzatib borishi kerak boʻldi. Hotty Toddy va tarix.",
          ru: "В октябре 1962 года Джеймс Мередит стал первым чернокожим студентом, принятым в Университет Миссисипи. На кампус его пришлось провожать федеральным маршалам и войскам. Hotty Toddy, и это история.",
        },
      },
    ],
  },
  {
    id: "europe-redrawn",
    name: { en: "Europe redrawn, 1914–1994", uz: "Yevropa qayta chizildi, 1914–1994", ru: "Перекроенная Европа, 1914–1994" },
    blurb: {
      en: "Four moments of a continent remaking its borders. Try Compare mode on each stop.",
      uz: "Chegaralarini qayta chizgan qitʼaning toʻrt lahzasi. Har bir bekatda solishtirish rejimini sinab koʻring.",
      ru: "Четыре момента, когда континент перекраивал границы. Попробуйте режим сравнения на каждой остановке.",
    },
    stops: [
      {
        year: 1914, center: [18, 50], zoom: 3.4, query: "Europe",
        title: { en: "On the eve of war", uz: "Urush arafasida", ru: "Накануне войны" },
        text: {
          en: "In 1914 four empires covered most of Central and Eastern Europe: Germany, Austria-Hungary, Russia and the Ottomans.",
          uz: "1914-yilda Markaziy va Sharqiy Yevropaning katta qismini toʻrt imperiya egallab turardi: Germaniya, Avstriya-Vengriya, Rossiya va Usmoniylar.",
          ru: "В 1914 году почти всю Центральную и Восточную Европу занимали четыре империи: Германская, Австро-Венгерская, Российская и Османская.",
        },
      },
      {
        year: 1920, center: [18, 50], zoom: 3.4, query: "Europe",
        title: { en: "After Versailles", uz: "Versaldan keyin", ru: "После Версаля" },
        text: {
          en: "Six years later all four were gone. Poland, Czechoslovakia, Yugoslavia and the Baltic states appear, and so do many disputed lines.",
          uz: "Olti yildan soʻng toʻrttalasi ham yoʻq boʻldi. Polsha, Chexoslovakiya, Yugoslaviya va Boltiqboʻyi davlatlari paydo boʻldi, bahsli chegaralar ham koʻpaydi.",
          ru: "Через шесть лет не осталось ни одной из них. Появляются Польша, Чехословакия, Югославия и страны Балтии, а с ними и множество спорных линий.",
        },
      },
      {
        year: 1945, center: [18, 50], zoom: 3.4, query: "Europe",
        title: { en: "1945", uz: "1945", ru: "1945" },
        text: {
          en: "Poland was moved west, Germany was split into occupation zones, and the Iron Curtain was about to come down across the continent.",
          uz: "Polsha gʻarbga surildi, Germaniya ishgʻol zonalariga boʻlindi va tez orada qitʼa boʻylab “temir parda” tushdi.",
          ru: "Польшу сдвинули на запад, Германию разделили на оккупационные зоны, и над континентом вот-вот опустится железный занавес.",
        },
      },
      {
        year: 1994, center: [30, 50], zoom: 3, query: "Europe",
        title: { en: "After the Soviet Union", uz: "Sovet Ittifoqidan keyin", ru: "После Советского Союза" },
        text: {
          en: "Fifteen republics leave the USSR, Czechoslovakia splits peacefully, and Yugoslavia breaks apart violently. Press C and compare this year with 1914.",
          uz: "Oʻn besh respublika SSSRdan ajraladi, Chexoslovakiya tinch yoʻl bilan boʻlinadi, Yugoslaviya esa qonli tarzda parchalanadi. C tugmasini bosing va bu yilni 1914-yil bilan solishtiring.",
          ru: "Пятнадцать республик выходят из СССР, Чехословакия мирно разделяется, а Югославия распадается в крови. Нажмите C и сравните этот год с 1914-м.",
        },
      },
    ],
  },
];
