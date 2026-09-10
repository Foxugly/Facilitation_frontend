import { AppLang } from '../../core/i18n/available-languages';

export type AboutTechCard = {
  title: string;
  description: string;
  items: string[];
};

export type AboutLegalSection = {
  title: string;
  content: string[];
};

export type AboutUiText = {
  tabs: {
    company: string;
    legal: string;
    technical: string;
  };

  companyTitle: string;
  companyIntro: string;
  company: {
    contactLabel: string;
    companyLabel: string;
    vatLabel: string;
    addressLabel: string;
    emailLabel: string;
    emailButton: string;
    phoneLabel: string;
    websiteLabel: string;
  };

  legalTitle: string;
  legalIntro: string;
  legalSections: AboutLegalSection[];

  technicalTitle: string;
  technicalIntro: string;
  repositoryUrlLabel: string;
  cards: {
    repository: AboutTechCard;
    backend: AboutTechCard;
    frontend: AboutTechCard;
  };
};

const FR: AboutUiText = {
  tabs: {
    company: 'Société',
    legal: 'Mentions légales',
    technical: 'Technique',
  },

  companyTitle: 'Société',
  companyIntro: 'Informations légales et coordonnées de la société qui édite et exploite Poker.',
  company: {
    contactLabel: 'Contact',
    companyLabel: 'Société',
    vatLabel: 'TVA / BCE',
    addressLabel: 'Adresse',
    emailLabel: 'Email',
    emailButton: 'M\'envoyer un email',
    phoneLabel: 'Téléphone',
    websiteLabel: 'Site web',
  },

  legalTitle: 'Mentions légales & protection des données',
  legalIntro: 'Poker respecte la réglementation européenne en matière de protection des données personnelles.',
  legalSections: [
    {
      title: 'Responsable du traitement',
      content: [
        'Le responsable du traitement des données est l\'administrateur de l\'instance Poker déployée.',
        'Pour toute question relative à vos données personnelles, contactez l\'administrateur de votre instance.',
      ],
    },
    {
      title: 'Données collectées',
      content: [
        'Données d\'identification : adresse email et nom d\'affichage.',
        'Données d\'activité : salles, sujets, votes, sessions et préférences de langue.',
        'Données techniques : journaux de connexion strictement nécessaires à la sécurité.',
      ],
    },
    {
      title: 'Base légale et finalités (RGPD Art. 6)',
      content: [
        'Exécution d\'un contrat : gestion de votre compte, création de salles, votes et historique.',
        'Intérêt légitime : sécurité de la plateforme, prévention des abus, amélioration du service.',
        'Consentement : envoi de notifications optionnelles (révocable à tout moment).',
      ],
    },
    {
      title: 'Vos droits (RGPD Art. 15-22)',
      content: [
        'Droit d\'accès : obtenir une copie de vos données personnelles.',
        'Droit de rectification : corriger des données inexactes ou incomplètes.',
        'Droit à l\'effacement : demander la suppression de vos données.',
        'Droit à la portabilité : recevoir vos données dans un format structuré et lisible.',
        'Droit d\'opposition : vous opposer au traitement dans certains cas.',
        'Droit de réclamation : introduire une réclamation auprès de votre autorité de contrôle nationale.',
      ],
    },
    {
      title: 'Conservation des données',
      content: [
        'Les données de compte sont conservées pendant la durée de votre inscription.',
        'Les données de session et de résultats sont conservées tant que le domaine est actif.',
        'À la suppression de votre compte, vos données personnelles sont supprimées ou anonymisées dans un délai de 30 jours.',
      ],
    },
    {
      title: 'Sécurité',
      content: [
        'Les communications sont chiffrées via HTTPS/TLS.',
        'Les mots de passe sont hachés avec un algorithme irréversible (PBKDF2).',
        'L\'authentification repose sur des jetons JWT à durée de vie limitée.',
      ],
    },
    {
      title: 'Cookies',
      content: [
        'Poker n\'utilise pas de cookies de traçage ni de cookies publicitaires.',
        'Seuls des cookies techniques strictement nécessaires au fonctionnement (session, préférence de langue) sont utilisés.',
      ],
    },
  ],

  technicalTitle: 'Informations techniques',
  technicalIntro: 'Application web temps réel répartie en deux dépôts : un backend Django (Django Channels / WebSocket) et un frontend Angular.',
  repositoryUrlLabel: 'Dépôts',
  cards: {
    repository: {
      title: 'Dépôts',
      description: 'Code source et intégration continue sur GitHub.',
      items: [
        'Deux dépôts GitHub : backend et frontend.',
        'Déploiement continu via GitHub Actions (OIDC → AWS SSM).',
        'Tests automatisés à chaque push.',
      ],
    },
    backend: {
      title: 'Backend',
      description: 'API REST + temps réel, logique métier et sécurité.',
      items: [
        'Django et Django REST Framework',
        'Django Channels (WebSocket / ASGI) et Redis',
        'Simple JWT et django-parler',
        'Microsoft Graph pour les emails transactionnels',
      ],
    },
    frontend: {
      title: 'Frontend',
      description: 'Application temps réel (SPA).',
      items: [
        'Angular 21, TypeScript et signals',
        'PrimeNG 21 et SCSS/BEM',
        'Transloco (5 langues)',
        'Tests Vitest',
      ],
    },
  },
};

const EN: AboutUiText = {
  tabs: {
    company: 'Company',
    legal: 'Legal notice',
    technical: 'Technical',
  },

  companyTitle: 'Company',
  companyIntro: 'Legal information and contact details of the company that operates Poker.',
  company: {
    contactLabel: 'Contact',
    companyLabel: 'Company',
    vatLabel: 'VAT / BCE',
    addressLabel: 'Address',
    emailLabel: 'Email',
    emailButton: 'Send me an email',
    phoneLabel: 'Phone',
    websiteLabel: 'Website',
  },

  legalTitle: 'Legal notice & data protection',
  legalIntro: 'Poker complies with European regulations on personal data protection.',
  legalSections: [
    {
      title: 'Data controller',
      content: [
        'The data controller is the administrator of the deployed Poker instance.',
        'For any question regarding your personal data, contact the administrator of your instance.',
      ],
    },
    {
      title: 'Data collected',
      content: [
        'Identification data: email address and display name.',
        'Activity data: rooms, subjects, votes, sessions and language preferences.',
        'Technical data: connection logs strictly necessary for security.',
      ],
    },
    {
      title: 'Legal basis and purposes (GDPR Art. 6)',
      content: [
        'Performance of a contract: managing your account, creating rooms, voting and history.',
        'Legitimate interest: platform security, abuse prevention, service improvement.',
        'Consent: sending optional notifications (revocable at any time).',
      ],
    },
    {
      title: 'Your rights (GDPR Art. 15-22)',
      content: [
        'Right of access: obtain a copy of your personal data.',
        'Right to rectification: correct inaccurate or incomplete data.',
        'Right to erasure: request the deletion of your data.',
        'Right to data portability: receive your data in a structured, readable format.',
        'Right to object: object to processing in certain cases.',
        'Right to lodge a complaint: file a complaint with your national supervisory authority.',
      ],
    },
    {
      title: 'Data retention',
      content: [
        'Account data is retained for the duration of your registration.',
        'Session and result data is retained as long as the domain is active.',
        'Upon account deletion, your personal data is deleted or anonymized within 30 days.',
      ],
    },
    {
      title: 'Security',
      content: [
        'Communications are encrypted via HTTPS/TLS.',
        'Passwords are hashed using an irreversible algorithm (PBKDF2).',
        'Authentication relies on short-lived JWT tokens.',
      ],
    },
    {
      title: 'Cookies',
      content: [
        'Poker does not use tracking cookies or advertising cookies.',
        'Only strictly necessary technical cookies (session, language preference) are used.',
      ],
    },
  ],

  technicalTitle: 'Technical details',
  technicalIntro: 'A real-time web application split across two repositories: a Django backend (Django Channels / WebSocket) and an Angular frontend.',
  repositoryUrlLabel: 'Repositories',
  cards: {
    repository: {
      title: 'Repositories',
      description: 'Source code and continuous integration on GitHub.',
      items: [
        'Two GitHub repositories: backend and frontend.',
        'Continuous deployment via GitHub Actions (OIDC → AWS SSM).',
        'Automated tests on every push.',
      ],
    },
    backend: {
      title: 'Backend',
      description: 'REST + real-time API, business rules and security.',
      items: [
        'Django and Django REST Framework',
        'Django Channels (WebSocket / ASGI) and Redis',
        'Simple JWT and django-parler',
        'Microsoft Graph for transactional emails',
      ],
    },
    frontend: {
      title: 'Frontend',
      description: 'Real-time single-page app.',
      items: [
        'Angular 21, TypeScript and signals',
        'PrimeNG 21 and SCSS/BEM',
        'Transloco (5 languages)',
        'Vitest tests',
      ],
    },
  },
};

const NL: AboutUiText = {
  tabs: {
    company: 'Bedrijf',
    legal: 'Juridisch',
    technical: 'Technisch',
  },

  companyTitle: 'Bedrijf',
  companyIntro: 'Juridische informatie en contactgegevens van het bedrijf dat Poker uitbaat.',
  company: {
    contactLabel: 'Contact',
    companyLabel: 'Bedrijf',
    vatLabel: 'BTW / KBO',
    addressLabel: 'Adres',
    emailLabel: 'E-mail',
    emailButton: 'Stuur mij een e-mail',
    phoneLabel: 'Telefoon',
    websiteLabel: 'Website',
  },

  legalTitle: 'Juridische informatie & gegevensbescherming',
  legalIntro: 'Poker voldoet aan de Europese regelgeving inzake de bescherming van persoonsgegevens.',
  legalSections: [
    {
      title: 'Verwerkingsverantwoordelijke',
      content: [
        'De verwerkingsverantwoordelijke is de beheerder van de geinstalleerde Poker-instantie.',
        'Neem voor vragen over uw persoonsgegevens contact op met de beheerder van uw instantie.',
      ],
    },
    {
      title: 'Verzamelde gegevens',
      content: [
        'Identificatiegegevens: e-mailadres en weergavenaam.',
        'Activiteitsgegevens: kamers, onderwerpen, stemmen, sessies en taalvoorkeuren.',
        'Technische gegevens: verbindingslogboeken, strikt noodzakelijk voor beveiliging.',
      ],
    },
    {
      title: 'Rechtsgrond en doeleinden (AVG Art. 6)',
      content: [
        'Uitvoering van een overeenkomst: beheer van uw account, kamers aanmaken, stemmen en geschiedenis.',
        'Gerechtvaardigd belang: beveiliging van het platform, misbruikpreventie, verbetering van de dienst.',
        'Toestemming: verzending van optionele meldingen (op elk moment intrekbaar).',
      ],
    },
    {
      title: 'Uw rechten (AVG Art. 15-22)',
      content: [
        'Recht van inzage: een kopie van uw persoonsgegevens verkrijgen.',
        'Recht op rectificatie: onjuiste of onvolledige gegevens corrigeren.',
        'Recht op verwijdering: verzoek tot verwijdering van uw gegevens.',
        'Recht op overdraagbaarheid: uw gegevens ontvangen in een gestructureerd, leesbaar formaat.',
        'Recht van bezwaar: u verzetten tegen verwerking in bepaalde gevallen.',
        'Recht om klacht in te dienen: een klacht indienen bij uw nationale toezichthoudende autoriteit.',
      ],
    },
    {
      title: 'Bewaring van gegevens',
      content: [
        'Accountgegevens worden bewaard gedurende de looptijd van uw registratie.',
        'Sessie- en resultaatgegevens worden bewaard zolang het domein actief is.',
        'Bij verwijdering van uw account worden uw persoonsgegevens binnen 30 dagen verwijderd of geanonimiseerd.',
      ],
    },
    {
      title: 'Beveiliging',
      content: [
        'Communicatie wordt versleuteld via HTTPS/TLS.',
        'Wachtwoorden worden gehasht met een onomkeerbaar algoritme (PBKDF2).',
        'Authenticatie is gebaseerd op JWT-tokens met beperkte levensduur.',
      ],
    },
    {
      title: 'Cookies',
      content: [
        'Poker maakt geen gebruik van tracking- of advertentiecookies.',
        'Alleen strikt noodzakelijke technische cookies (sessie, taalvoorkeur) worden gebruikt.',
      ],
    },
  ],

  technicalTitle: 'Technische informatie',
  technicalIntro: 'Een realtime-webapplicatie verdeeld over twee repositories: een Django-backend (Django Channels / WebSocket) en een Angular-frontend.',
  repositoryUrlLabel: 'Repositories',
  cards: {
    repository: {
      title: 'Repositories',
      description: 'Broncode en continue integratie op GitHub.',
      items: [
        'Twee GitHub-repositories: backend en frontend.',
        'Continue deployment via GitHub Actions (OIDC → AWS SSM).',
        'Automatische tests bij elke push.',
      ],
    },
    backend: {
      title: 'Backend',
      description: 'REST- + realtime-API, bedrijfslogica en beveiliging.',
      items: [
        'Django en Django REST Framework',
        'Django Channels (WebSocket / ASGI) en Redis',
        'Simple JWT en django-parler',
        'Microsoft Graph voor transactionele e-mails',
      ],
    },
    frontend: {
      title: 'Frontend',
      description: 'Realtime single-page app.',
      items: [
        'Angular 21, TypeScript en signals',
        'PrimeNG 21 en SCSS/BEM',
        'Transloco (5 talen)',
        'Vitest-tests',
      ],
    },
  },
};

const IT: AboutUiText = {
  tabs: {
    company: 'Società',
    legal: 'Note legali',
    technical: 'Tecnico',
  },

  companyTitle: 'Società',
  companyIntro: 'Informazioni legali e contatti della società che gestisce Poker.',
  company: {
    contactLabel: 'Contatto',
    companyLabel: 'Società',
    vatLabel: 'P.IVA / BCE',
    addressLabel: 'Indirizzo',
    emailLabel: 'Email',
    emailButton: 'Inviami una email',
    phoneLabel: 'Telefono',
    websiteLabel: 'Sito web',
  },

  legalTitle: 'Note legali e protezione dei dati',
  legalIntro: 'Poker rispetta la normativa europea sulla protezione dei dati personali.',
  legalSections: [
    {
      title: 'Titolare del trattamento',
      content: [
        'Il titolare del trattamento e l\'amministratore dell\'istanza Poker installata.',
        'Per qualsiasi domanda sui dati personali, contattare l\'amministratore della propria istanza.',
      ],
    },
    {
      title: 'Dati raccolti',
      content: [
        'Dati identificativi: indirizzo email e nome visualizzato.',
        'Dati di attivita: stanze, argomenti, voti, sessioni e preferenze linguistiche.',
        'Dati tecnici: registri di connessione strettamente necessari per la sicurezza.',
      ],
    },
    {
      title: 'Base giuridica e finalita (GDPR Art. 6)',
      content: [
        'Esecuzione di un contratto: gestione dell\'account, creazione di stanze, voti e cronologia.',
        'Interesse legittimo: sicurezza della piattaforma, prevenzione degli abusi, miglioramento del servizio.',
        'Consenso: invio di notifiche opzionali (revocabile in qualsiasi momento).',
      ],
    },
    {
      title: 'I tuoi diritti (GDPR Art. 15-22)',
      content: [
        'Diritto di accesso: ottenere una copia dei tuoi dati personali.',
        'Diritto di rettifica: correggere dati inesatti o incompleti.',
        'Diritto alla cancellazione: richiedere la cancellazione dei tuoi dati.',
        'Diritto alla portabilita: ricevere i tuoi dati in un formato strutturato e leggibile.',
        'Diritto di opposizione: opporsi al trattamento in determinati casi.',
        'Diritto di reclamo: presentare un reclamo presso l\'autorita di controllo nazionale.',
      ],
    },
    {
      title: 'Conservazione dei dati',
      content: [
        'I dati dell\'account sono conservati per la durata della registrazione.',
        'I dati di sessione e risultati sono conservati finche il dominio e attivo.',
        'Alla cancellazione dell\'account, i dati personali vengono eliminati o anonimizzati entro 30 giorni.',
      ],
    },
    {
      title: 'Sicurezza',
      content: [
        'Le comunicazioni sono crittografate tramite HTTPS/TLS.',
        'Le password sono sottoposte a hash con un algoritmo irreversibile (PBKDF2).',
        'L\'autenticazione si basa su token JWT a durata limitata.',
      ],
    },
    {
      title: 'Cookie',
      content: [
        'Poker non utilizza cookie di tracciamento ne cookie pubblicitari.',
        'Vengono utilizzati solo cookie tecnici strettamente necessari (sessione, preferenza linguistica).',
      ],
    },
  ],

  technicalTitle: 'Informazioni tecniche',
  technicalIntro: 'Applicazione web in tempo reale suddivisa in due repository: un backend Django (Django Channels / WebSocket) e un frontend Angular.',
  repositoryUrlLabel: 'Repository',
  cards: {
    repository: {
      title: 'Repository',
      description: 'Codice sorgente e integrazione continua su GitHub.',
      items: [
        'Due repository GitHub: backend e frontend.',
        'Deployment continuo tramite GitHub Actions (OIDC → AWS SSM).',
        'Test automatici a ogni push.',
      ],
    },
    backend: {
      title: 'Backend',
      description: 'API REST + tempo reale, logica di business e sicurezza.',
      items: [
        'Django e Django REST Framework',
        'Django Channels (WebSocket / ASGI) e Redis',
        'Simple JWT e django-parler',
        'Microsoft Graph per le email transazionali',
      ],
    },
    frontend: {
      title: 'Frontend',
      description: 'App single-page in tempo reale.',
      items: [
        'Angular 21, TypeScript e signals',
        'PrimeNG 21 e SCSS/BEM',
        'Transloco (5 lingue)',
        'Test Vitest',
      ],
    },
  },
};

const ES: AboutUiText = {
  tabs: {
    company: 'Empresa',
    legal: 'Aviso legal',
    technical: 'Tecnico',
  },

  companyTitle: 'Empresa',
  companyIntro: 'Información legal y datos de contacto de la empresa que opera Poker.',
  company: {
    contactLabel: 'Contacto',
    companyLabel: 'Empresa',
    vatLabel: 'IVA / BCE',
    addressLabel: 'Dirección',
    emailLabel: 'Correo',
    emailButton: 'Enviarme un correo',
    phoneLabel: 'Teléfono',
    websiteLabel: 'Sitio web',
  },

  legalTitle: 'Aviso legal y proteccion de datos',
  legalIntro: 'Poker cumple con la normativa europea sobre proteccion de datos personales.',
  legalSections: [
    {
      title: 'Responsable del tratamiento',
      content: [
        'El responsable del tratamiento de datos es el administrador de la instancia Poker desplegada.',
        'Para cualquier consulta sobre sus datos personales, contacte con el administrador de su instancia.',
      ],
    },
    {
      title: 'Datos recogidos',
      content: [
        'Datos de identificacion: correo electronico y nombre para mostrar.',
        'Datos de actividad: salas, temas, votos, sesiones y preferencias de idioma.',
        'Datos tecnicos: registros de conexion estrictamente necesarios para la seguridad.',
      ],
    },
    {
      title: 'Base legal y finalidades (RGPD Art. 6)',
      content: [
        'Ejecucion de un contrato: gestion de su cuenta, creacion de salas, votos e historial.',
        'Interes legitimo: seguridad de la plataforma, prevencion de abusos, mejora del servicio.',
        'Consentimiento: envio de notificaciones opcionales (revocable en cualquier momento).',
      ],
    },
    {
      title: 'Sus derechos (RGPD Art. 15-22)',
      content: [
        'Derecho de acceso: obtener una copia de sus datos personales.',
        'Derecho de rectificacion: corregir datos inexactos o incompletos.',
        'Derecho de supresion: solicitar la eliminacion de sus datos.',
        'Derecho a la portabilidad: recibir sus datos en un formato estructurado y legible.',
        'Derecho de oposicion: oponerse al tratamiento en determinados casos.',
        'Derecho de reclamacion: presentar una reclamacion ante su autoridad de control nacional.',
      ],
    },
    {
      title: 'Conservacion de datos',
      content: [
        'Los datos de cuenta se conservan durante el periodo de su registro.',
        'Los datos de sesion y resultados se conservan mientras el dominio este activo.',
        'Al eliminar su cuenta, sus datos personales se eliminan o anonimizan en un plazo de 30 dias.',
      ],
    },
    {
      title: 'Seguridad',
      content: [
        'Las comunicaciones se cifran mediante HTTPS/TLS.',
        'Las contrasenas se almacenan con un algoritmo de hash irreversible (PBKDF2).',
        'La autenticacion se basa en tokens JWT de vida limitada.',
      ],
    },
    {
      title: 'Cookies',
      content: [
        'Poker no utiliza cookies de rastreo ni cookies publicitarias.',
        'Solo se utilizan cookies tecnicas estrictamente necesarias (sesion, preferencia de idioma).',
      ],
    },
  ],

  technicalTitle: 'Informacion tecnica',
  technicalIntro: 'Aplicacion web en tiempo real repartida en dos repositorios: un backend Django (Django Channels / WebSocket) y un frontend Angular.',
  repositoryUrlLabel: 'Repositorios',
  cards: {
    repository: {
      title: 'Repositorios',
      description: 'Codigo fuente e integracion continua en GitHub.',
      items: [
        'Dos repositorios GitHub: backend y frontend.',
        'Despliegue continuo mediante GitHub Actions (OIDC → AWS SSM).',
        'Pruebas automaticas en cada push.',
      ],
    },
    backend: {
      title: 'Backend',
      description: 'API REST + tiempo real, reglas de negocio y seguridad.',
      items: [
        'Django y Django REST Framework',
        'Django Channels (WebSocket / ASGI) y Redis',
        'Simple JWT y django-parler',
        'Microsoft Graph para los correos transaccionales',
      ],
    },
    frontend: {
      title: 'Frontend',
      description: 'Aplicacion de una sola pagina en tiempo real.',
      items: [
        'Angular 21, TypeScript y signals',
        'PrimeNG 21 y SCSS/BEM',
        'Transloco (5 idiomas)',
        'Pruebas Vitest',
      ],
    },
  },
};

const UI_TEXT: Record<AppLang, AboutUiText> = {
  fr: FR,
  en: EN,
  nl: NL,
  it: IT,
  es: ES,
};

export function getAboutUiText(lang: string | null | undefined): AboutUiText {
  return UI_TEXT[lang as AppLang] ?? FR;
}
