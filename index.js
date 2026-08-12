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
// Se configuran en Railway mediante:
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

// Bots autorizados para otorgar roles manualmente.
//
// Se configuran en Railway mediante:
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
// Se configuran en Railway mediante:
// PROTECTED_ROLE_IDS
//
// Ejemplo:
// 123456789012345678,987654321098765432

const PROTECTED_ROLE_IDS = process.env.PROTECTED_ROLE_IDS
  ? process.env.PROTECTED_ROLE_IDS
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

// Comprobar si una persona/bot está autorizado
function isAuthorized(userId) {
  return (
    WHITELIST.includes(userId) ||
    AUTHORIZED_BOT_IDS.includes(userId)
  );
}


// =====================================
// BUSCAR MIEMBRO
// =====================================

// Busca por:
// - Mención
// - ID
// - Username
// - Display name

async function findMember(guild, input) {
  input = input.trim();

  // Mención: <@123456789>
  // Mención con nickname: <@!123456789>
  const mentionMatch = input.match(/^<@!?(\d+)>$/);

  if (mentionMatch) {
    return guild.members
      .fetch(mentionMatch[1])
      .catch(() => null);
  }

  // ID
  if (/^\d{17,20}$/.test(input)) {
    return guild.members
      .fetch(input)
      .catch(() => null);
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


// =====================================
// BUSCAR ROL
// =====================================

// Busca por:
// - Mención
// - ID
// - Nombre

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

  // Nombre
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
// ,r 987654321098765432 123456789012345678
//
// El bot detectará automáticamente cuál
// argumento es el usuario y cuál es el rol.
//

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;

    // No procesar comandos enviados por bots
    if (message.author.bot) return;

    // Comprobar prefijo
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

    // Intentar identificar ambos como miembro
    const firstMember = await findMember(
      message.guild,
      first
    );

    const secondMember = await findMember(
      message.guild,
      second
    );

    // Intentar identificar ambos como rol
    const firstRole = findRole(
      message.guild,
      first
    );

    const secondRole = findRole(
      message.guild,
      second
    );

    let targetMember = null;
    let targetRole = null;


    // =====================================
    // ,r ROL USUARIO
    // =====================================

    if (firstRole && secondMember) {
      targetRole = firstRole;
      targetMember = secondMember;
    }


    // =====================================
    // ,r USUARIO ROL
    // =====================================

    else if (firstMember && secondRole) {
      targetMember = firstMember;
      targetRole = secondRole;
    }


    // =====================================
    // NO SE PUDO DETERMINAR
    // =====================================

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
    // IMPORTANTE
    // =====================================
    //
    // NO comprobamos WL aquí.
    //
    // Tanto personas en WL como personas fuera
    // de WL pueden utilizar ,r.
    //
    // La protección manual se controla mediante
    // el Audit Log.
    //


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
    console.error(
      "❌ Error en comando ,r:",
      error
    );

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

    if (addedRoles.size === 0) {
      return;
    }


    // =====================================
    // VER SI SE AGREGÓ UN ROL PROTEGIDO
    // =====================================

    const protectedRolesAdded = addedRoles.filter(
      role => PROTECTED_ROLE_IDS.includes(role.id)
    );

    if (protectedRolesAdded.size === 0) {
      return;
    }


    // =====================================
    // ESPERAR AL AUDIT LOG
    // =====================================

    // Discord puede tardar un momento en registrar
    // la acción en el Audit Log.

    await new Promise(resolve =>
      setTimeout(resolve, 1500)
    );


    // =====================================
    // BUSCAR QUIÉN HIZO EL CAMBIO
    // =====================================

    const auditLogs =
      await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 10
      });


    // Buscar la entrada correspondiente al miembro
    // actualizado y reciente.

    const entry = auditLogs.entries.find(entry =>
      entry.target?.id === newMember.id &&
      Date.now() - entry.createdTimestamp < 10000
    );


    if (!entry || !entry.executor) {
      console.log(
        "⚠️ No se pudo identificar quién otorgó el rol protegido."
      );

      return;
    }


    const executor = entry.executor;


    // =====================================
    // SI FUE EL PROPIO BOT
    // =====================================

    // Si Swagger otorgó el rol mediante ,r,
    // no debe castigarse a sí mismo.

    if (executor.id === client.user.id) {
      return;
    }


    // =====================================
    // COMPROBAR AUTORIZACIÓN
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
    // QUITAR EL ROL PROTEGIDO AL RECEPTOR
    // =====================================

    for (const role of protectedRolesAdded.values()) {

      if (role.id === newMember.guild.id) {
        continue;
      }

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

    const offender =
      await newMember.guild.members
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
    // QUITAR TODOS LOS ROLES POSIBLES
    // =====================================

    // Discord NO permite que el bot quite:
    //
    // - @everyone
    // - roles administrados por integraciones/bots
    // - roles que estén por encima o al mismo nivel
    //   que el rol más alto del bot
    //
    // Por eso solamente seleccionamos roles que
    // Swagger realmente puede gestionar.

    const removableRoles = offender.roles.cache.filter(role =>
      role.id !== newMember.guild.id &&
      !role.managed &&
      role.editable
    );


    // =====================================
    // SI NO TIENE ROLES QUITABLES
    // =====================================

    if (removableRoles.size === 0) {

      console.log(
        `ℹ️ ${offender.user.tag} no tiene roles que Swagger pueda quitar.`
      );

      return;
    }


    // =====================================
    // QUITAR TODOS LOS ROLES
    // =====================================

    for (const role of removableRoles.values()) {

      try {

        await offender.roles.remove(
          role,
          "Castigo por otorgar manualmente un rol protegido sin estar en WL"
        );

        console.log(
          `🚨 Se quitó "${role.name}" a ${offender.user.tag}.`
        );

      } catch (error) {

        console.error(
          `❌ No se pudo quitar "${role.name}" a ${offender.user.tag}:`,
          error.message
        );

      }
    }


    console.log(
      `🚨 Castigo completado para ${offender.user.tag}.`
    );

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
