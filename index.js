const {
  Client,
  GatewayIntentBits,
  AuditLogEvent
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================================
// CONFIGURACIÓN
// =====================================

// Personas autorizadas para DAR ROLES MANUALMENTE.
//
// En el hosting pondremos sus IDs en:
// WHITELIST_IDS
//
// Ejemplo:
// 123456789012345678,987654321098765432

const WHITELIST = process.env.WHITELIST_IDS
  ? process.env.WHITELIST_IDS
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];


// =====================================
// BOTS AUTORIZADOS
// =====================================

// Puedes poner aquí los IDs de bots que tienen permiso
// para otorgar roles manualmente.
//
// También puedes ponerlos en:
// AUTHORIZED_BOT_IDS
//
// Ejemplo:
// 123456789012345678,987654321098765432

const AUTHORIZED_BOT_IDS = process.env.AUTHORIZED_BOT_IDS
  ? process.env.AUTHORIZED_BOT_IDS
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];


// =====================================
// ROLES PROTEGIDOS
// =====================================

// SOLO estos roles estarán protegidos.
//
// IMPORTANTE:
// Pon aquí los IDs de los roles que quieres controlar.
//
// Ejemplo:
//
// const PROTECTED_ROLE_IDS = [
//   "123456789012345678",
//   "987654321098765432"
// ];

const PROTECTED_ROLE_IDS = process.env.PROTECTED_ROLE_IDS
  ? process.env.PROTECTED_ROLE_IDS
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];


// =====================================
// ROLES QUE SE QUITARÁN COMO CASTIGO
// =====================================

// Cuando alguien NO autorizado dé manualmente
// un rol protegido, estos son los roles que
// se le quitarán al infractor.
//
// Ejemplo:
//
// const PUNISHMENT_ROLE_IDS = [
//   "123456789012345678",
//   "987654321098765432"
// ];

const PUNISHMENT_ROLE_IDS = process.env.PUNISHMENT_ROLE_IDS
  ? process.env.PUNISHMENT_ROLE_IDS
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];


// =====================================
// PREFIJO DEL COMANDO
// =====================================

const PREFIX = ",";


// =====================================
// BOT ENCENDIDO
// =====================================

client.once("ready", () => {
  console.log(`✅ ${client.user.tag} está encendido.`);
  console.log(`🛡️ Roles protegidos: ${PROTECTED_ROLE_IDS.length}`);
  console.log(`👥 Personas en WL: ${WHITELIST.length}`);
  console.log(`🤖 Bots autorizados: ${AUTHORIZED_BOT_IDS.length}`);
});


// =====================================
// FUNCIONES AUXILIARES
// =====================================

// Comprobar si una persona está autorizada
function isAuthorized(userId) {
  return (
    WHITELIST.includes(userId) ||
    AUTHORIZED_BOT_IDS.includes(userId)
  );
}


// Buscar un miembro por ID, mención o nombre
async function findMember(guild, input) {
  input = input.trim();

  // Mención: <@123456789>
  const mentionMatch = input.match(/^<@!?(\d+)>$/);

  if (mentionMatch) {
    return guild.members.fetch(mentionMatch[1]).catch(() => null);
  }

  // ID
  if (/^\d{17,20}$/.test(input)) {
    return guild.members.fetch(input).catch(() => null);
  }

  // Nombre exacto / username
  const members = await guild.members.fetch();

  const lower = input.toLowerCase();

  return (
    members.find(member =>
      member.user.username.toLowerCase() === lower
    ) ||
    members.find(member =>
      member.displayName.toLowerCase() === lower
    ) ||
    null
  );
}


// Buscar un rol por ID, mención o nombre
function findRole(guild, input) {
  input = input.trim();

  // Mención: <@&123456789>
  const mentionMatch = input.match(/^<@&(\d+)>$/);

  if (mentionMatch) {
    return guild.roles.cache.get(mentionMatch[1]) || null;
  }

  // ID
  if (/^\d{17,20}$/.test(input)) {
    return guild.roles.cache.get(input) || null;
  }

  const lower = input.toLowerCase();

  return (
    guild.roles.cache.find(role =>
      role.name.toLowerCase() === lower
    ) || null
  );
}


// =====================================
// COMANDO ,r
// =====================================
//
// FORMAS ACEPTADAS:
//
// ,r Moderador @Usuario
//
// ,r @Usuario Moderador
//
// ,r 123456789012345678 987654321098765432
//
// El bot detectará automáticamente cuál
// argumento es el usuario y cuál es el rol.
//

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    if (!message.content.toLowerCase().startsWith(PREFIX + "r")) {
      return;
    }

    const args = message.content.trim().split(/\s+/);

    // ,r + usuario + rol = 3 elementos
    if (args.length !== 3) {
      return message.reply(
        "❌ Uso correcto: `,r @Usuario @Rol` o `,r @Rol @Usuario`"
      );
    }

    const first = args[1];
    const second = args[2];

    const firstMember = await findMember(message.guild, first);
    const secondMember = await findMember(message.guild, second);

    const firstRole = findRole(message.guild, first);
    const secondRole = findRole(message.guild, second);

    let targetMember = null;
    let targetRole = null;

    // -----------------------------
    // ,r ROL USUARIO
    // -----------------------------

    if (firstRole && secondMember) {
      targetRole = firstRole;
      targetMember = secondMember;
    }

    // -----------------------------
    // ,r USUARIO ROL
    // -----------------------------

    else if (firstMember && secondRole) {
      targetMember = firstMember;
      targetRole = secondRole;
    }

    // -----------------------------
    // No se pudo determinar
    // -----------------------------

    else {
      return message.reply(
        "❌ No pude identificar correctamente el usuario y el rol."
      );
    }

    // =====================================
    // COMPROBAR QUE EL ROL ESTÉ PROTEGIDO
    // =====================================

    if (!PROTECTED_ROLE_IDS.includes(targetRole.id)) {
      return message.reply(
        `❌ El rol **${targetRole.name}** no está configurado como rol protegido.`
      );
    }

    // =====================================
    // COMPROBAR AUTORIZACIÓN DEL COMANDO
    // =====================================

    // IMPORTANTE:
    // Tanto alguien de WL como alguien FUERA de WL
    // puede utilizar ,r.
    //
    // Por eso NO comprobamos WHITELIST aquí.

    // =====================================
    // COMPROBAR JERARQUÍA
    // =====================================

    if (!targetRole.editable) {
      return message.reply(
        `❌ No puedo otorgar **${targetRole.name}** porque mi rol está por debajo de ese rol.`
      );
    }

    // =====================================
    // EVITAR DAR UN ROL QUE YA TIENE
    // =====================================

    if (targetMember.roles.cache.has(targetRole.id)) {
      return message.reply(
        `ℹ️ ${targetMember} ya tiene el rol **${targetRole.name}**.`
      );
    }

    // =====================================
    // DAR EL ROL
    // =====================================

    await targetMember.roles.add(
      targetRole,
      `Rol otorgado mediante ${PREFIX}r por ${message.author.tag}`
    );

    console.log(
      `✅ ${message.author.tag} otorgó "${targetRole.name}" a ${targetMember.user.tag} mediante ,r`
    );

    return message.reply(
      `✅ Se otorgó **${targetRole.name}** a ${targetMember}.`
    );

  } catch (error) {
    console.error("❌ Error en comando ,r:", error);

    if (message.guild) {
      message.reply(
        "❌ Ocurrió un error al intentar otorgar el rol."
      ).catch(() => {});
    }
  }
});


// =====================================
// DETECTAR CAMBIOS MANUALES DE ROLES
// =====================================

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {

    // =====================================
    // DETECTAR ROLES NUEVOS
    // =====================================

    const addedRoles = newMember.roles.cache.filter(
      role => !oldMember.roles.cache.has(role.id)
    );

    if (addedRoles.size === 0) return;


    // =====================================
    // ESPERAR AL AUDIT LOG
    // =====================================

    await new Promise(resolve => setTimeout(resolve, 1500));


    // =====================================
    // BUSCAR QUIÉN HIZO EL CAMBIO
    // =====================================

    const auditLogs = await newMember.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 10
    });

    const entry = auditLogs.entries.find(entry =>
      entry.target?.id === newMember.id &&
      Date.now() - entry.createdTimestamp < 10000
    );

    if (!entry || !entry.executor) {
      console.log(
        "⚠️ No se pudo identificar quién otorgó el rol."
      );
      return;
    }

    const executor = entry.executor;


    // =====================================
    // SI FUE EL PROPIO BOT
    // =====================================

    if (executor.id === client.user.id) {
      return;
    }


    // =====================================
    // VER SI SE AGREGÓ UN ROL PROTEGIDO
    // =====================================

    const protectedRolesAdded = addedRoles.filter(role =>
      PROTECTED_ROLE_IDS.includes(role.id)
    );

    if (protectedRolesAdded.size === 0) {
      return;
    }


    // =====================================
    // COMPROBAR WL
    // =====================================

    if (isAuthorized(executor.id)) {
      console.log(
        `✅ ${executor.tag} está autorizado. No se hace nada.`
      );

      return;
    }


    // =====================================
    // PERSONA FUERA DE WL
    // =====================================

    console.log(
      `🚨 ${executor.tag} intentó otorgar un rol protegido manualmente.`
    );


    // =====================================
    // QUITAR EL ROL AL RECEPTOR
    // =====================================

    for (const role of protectedRolesAdded.values()) {

      if (role.id === newMember.guild.id) continue;

      if (!role.editable) {
        console.log(
          `⚠️ No puedo quitar "${role.name}" por la jerarquía de Discord.`
        );

        continue;
      }

      if (newMember.roles.cache.has(role.id)) {

        await newMember.roles.remove(
          role.id,
          "Rol protegido otorgado manualmente por usuario fuera de WL"
        );

        console.log(
          `❌ Se quitó "${role.name}" de ${newMember.user.tag}.`
        );
      }
    }


    // =====================================
    // BUSCAR AL INFRACTOR
    // =====================================

    const offender = await newMember.guild.members
      .fetch(executor.id)
      .catch(() => null);

    if (!offender) {
      console.log(
        "⚠️ No se pudo encontrar al infractor en el servidor."
      );

      return;
    }


    // =====================================
    // SI ES EL DUEÑO
    // =====================================

    if (offender.id === newMember.guild.ownerId) {
      console.log(
        "⚠️ El infractor es el dueño del servidor. No se puede castigar."
      );

      return;
    }


    // =====================================
    // CASTIGAR AL INFRACTOR
    // =====================================

    for (const roleId of PUNISHMENT_ROLE_IDS) {

      const punishmentRole =
        offender.guild.roles.cache.get(roleId);

      if (!punishmentRole) continue;

      if (punishmentRole.managed) continue;

      if (!punishmentRole.editable) {
        console.log(
          `⚠️ No puedo quitar el rol de castigo "${punishmentRole.name}".`
        );

        continue;
      }

      if (offender.roles.cache.has(punishmentRole.id)) {

        await offender.roles.remove(
          punishmentRole,
          "Castigo por otorgar manualmente un rol protegido sin estar en WL"
        );

        console.log(
          `🚨 Se quitó "${punishmentRole.name}" a ${offender.user.tag}.`
        );
      }
    }

  } catch (error) {
    console.error(
      "❌ Error en protección de roles:",
      error
    );
  }
});


// =====================================
// INICIAR BOT
// =====================================

client.login(process.env.BOT_TOKEN);
