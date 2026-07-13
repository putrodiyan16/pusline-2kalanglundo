import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface CreateStudentRequest {
  email: string
  fullName: string
  className: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Verify auth - hanya guru yang bisa create student
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if user is teacher
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'teacher')
      .maybeSingle()

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Only teachers can create students' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body: CreateStudentRequest = await req.json()
    const { email, fullName, className } = body

    if (!email || !fullName || !className) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, fullName, className' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-12)

    // Create user with auto-confirmed email
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Langsung confirm, tidak perlu click link
      user_metadata: {
        full_name: fullName,
        class_name: className,
      },
    })

    if (createError || !createData.user) {
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${createError?.message || 'Unknown error'}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: createData.user.id,
      full_name: fullName,
      class_name: className,
    })

    if (profileError && !profileError.message.includes('duplicate')) {
      throw new Error(`Profile error: ${profileError.message}`)
    }

    // Set role as student
    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: createData.user.id,
      role: 'student',
    })

    if (roleError && !roleError.message.includes('duplicate')) {
      throw new Error(`Role error: ${roleError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: createData.user.id,
          email: createData.user.email,
        },
        tempPassword, // Return untuk guru bisa lihat/share
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
