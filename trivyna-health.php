<?php
/**
 * TRIVYNA Health & Diet AI - Backend Router & API Proxy
 * Supports Dual Mode: WordPress integration or standalone local SQLite fallback for testing.
 */

// 1. DUAL MODE INITIALIZATION
$is_wordpress = defined('ABSPATH');
$current_user_id = 0;
$db = null;

if ($is_wordpress) {
    global $wpdb;
    $table_name = $wpdb->prefix . 'trivyna_health_records';
    $current_user_id = get_current_user_id();
} else {
    // Standalone Mode: Use SQLite
    $db_file = __DIR__ . '/trivyna_health.db';
    try {
        $db = new PDO("sqlite:" . $db_file);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Create table if not exists in SQLite
        $db->exec("CREATE TABLE IF NOT EXISTS health_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            recorded_at TEXT,
            gender TEXT,
            height REAL,
            weight REAL,
            bmi REAL,
            blood_pressure_systolic INTEGER,
            blood_pressure_diastolic INTEGER,
            blood_glucose REAL,
            liver_ast INTEGER,
            liver_alt INTEGER,
            kidney_creatinine REAL,
            kidney_urea REAL,
            cholesterol REAL,
            triglycerides REAL,
            uric_acid REAL
        )");
    } catch (Exception $e) {
        // Fallback to in-memory if file write fails
        $db = new PDO("sqlite::memory:");
    }
    
    // Simulating user login in Standalone Mode
    session_start();
    if (!isset($_SESSION['mock_user_id'])) {
        $_SESSION['mock_user_id'] = 1; // Default mock user
    }
    $current_user_id = $_SESSION['mock_user_id'];
}

// 2. HELPER FUNCTIONS FOR DB OPERATIONS
function save_health_record($data) {
    global $is_wordpress, $wpdb, $table_name, $db, $current_user_id;
    if ($current_user_id <= 0) return false;

    $record = array(
        'user_id' => $current_user_id,
        'recorded_at' => date('Y-m-d H:i:s'),
        'gender' => $data['gender'] ?? 'Nam',
        'height' => floatval($data['height'] ?? 0),
        'weight' => floatval($data['weight'] ?? 0),
        'bmi' => floatval($data['bmi'] ?? 0),
        'blood_pressure_systolic' => intval($data['bp_systolic'] ?? 0),
        'blood_pressure_diastolic' => intval($data['bp_diastolic'] ?? 0),
        'blood_glucose' => floatval($data['glucose'] ?? 0),
        'liver_ast' => intval($data['ast'] ?? 0),
        'liver_alt' => intval($data['alt'] ?? 0),
        'kidney_creatinine' => floatval($data['creatinine'] ?? 0),
        'kidney_urea' => floatval($data['urea'] ?? 0),
        'cholesterol' => floatval($data['cholesterol'] ?? 0),
        'triglycerides' => floatval($data['triglycerides'] ?? 0),
        'uric_acid' => floatval($data['uric_acid'] ?? 0)
    );

    if ($is_wordpress) {
        return $wpdb->insert($table_name, $record);
    } else {
        $sql = "INSERT INTO health_records (user_id, recorded_at, gender, height, weight, bmi, 
                blood_pressure_systolic, blood_pressure_diastolic, blood_glucose, liver_ast, liver_alt, 
                kidney_creatinine, kidney_urea, cholesterol, triglycerides, uric_acid)
                VALUES (:user_id, :recorded_at, :gender, :height, :weight, :bmi, 
                :blood_pressure_systolic, :blood_pressure_diastolic, :blood_glucose, :liver_ast, :liver_alt, 
                :kidney_creatinine, :kidney_urea, :cholesterol, :triglycerides, :uric_acid)";
        $stmt = $db->prepare($sql);
        return $stmt->execute($record);
    }
}

function get_health_history() {
    global $is_wordpress, $wpdb, $table_name, $db, $current_user_id;
    if ($current_user_id <= 0) return array();

    if ($is_wordpress) {
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM $table_name WHERE user_id = %d ORDER BY recorded_at ASC", $current_user_id),
            ARRAY_A
        );
    } else {
        $stmt = $db->prepare("SELECT * FROM health_records WHERE user_id = :user_id ORDER BY recorded_at ASC");
        $stmt->execute(['user_id' => $current_user_id]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

// 3. API ACTION ROUTER
if (isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');
    $action = $_GET['action'];

    // Handle AJAX actions
    if ($action === 'check_auth') {
        echo json_encode(array(
            'logged_in' => $current_user_id > 0,
            'user_id' => $current_user_id,
            'is_wordpress' => $is_wordpress
        ));
        exit;
    }

    if ($action === 'get_history') {
        if ($current_user_id <= 0) {
            echo json_encode(array('success' => false, 'message' => 'User not logged in'));
            exit;
        }
        $history = get_health_history();
        echo json_encode(array('success' => true, 'data' => $history));
        exit;
    }

    if ($action === 'save_record') {
        if ($current_user_id <= 0) {
            echo json_encode(array('success' => false, 'message' => 'User not logged in'));
            exit;
        }
        $raw_data = json_decode(file_get_contents('php://input'), true);
        if (save_health_record($raw_data)) {
            echo json_encode(array('success' => true, 'message' => 'Saved successfully'));
        } else {
            echo json_encode(array('success' => false, 'message' => 'Failed to save to database'));
        }
        exit;
    }

    if ($action === 'call_gemini') {
        $raw_data = json_decode(file_get_contents('php://input'), true);
        $api_key = $raw_data['api_key'] ?? '';
        
        // If API key is not supplied in request, look in WordPress options or environment
        if (empty($api_key)) {
            if ($is_wordpress) {
                $api_key = get_option('trivyna_gemini_api_key', '');
            } else {
                $api_key = getenv('GEMINI_API_KEY') ?: '';
            }
        }

        if (empty($api_key)) {
            echo json_encode(array('success' => false, 'message' => 'Missing Gemini API Key.'));
            exit;
        }

        $type = $raw_data['type'] ?? 'analysis'; // 'analysis' or 'vision'
        
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . $api_key;
        
        $request_body = array();
        
        if ($type === 'vision') {
            $image_base64 = $raw_data['image_base64'] ?? '';
            if (empty($image_base64)) {
                echo json_encode(array('success' => false, 'message' => 'No image data provided.'));
                exit;
            }
            
            // Format base64 (strip mime header if present)
            if (preg_match('/^data:image\/(\w+);base64,/', $image_base64, $type_matches)) {
                $image_base64 = substr($image_base64, strpos($image_base64, ',') + 1);
            }
            
            $prompt = $raw_data['prompt'] ?? 'Identify food and calculate calories';
            
            $request_body = array(
                'contents' => array(
                    array(
                        'parts' => array(
                            array('text' => $prompt),
                            array(
                                'inlineData' => array(
                                    'mimeType' => 'image/jpeg',
                                    'data' => $image_base64
                                )
                            )
                        )
                    )
                )
            );
        } else {
            // Text analysis
            $prompt = $raw_data['prompt'] ?? '';
            $request_body = array(
                'contents' => array(
                    array(
                        'parts' => array(
                            array('text' => $prompt)
                        )
                    )
                )
            );
        }
        
        // Execute request to Google Gemini API
        $options = array(
            'http' => array(
                'header'  => "Content-Type: application/json\r\n",
                'method'  => 'POST',
                'content' => json_encode($request_body),
                'ignore_errors' => true,
                'timeout' => 15
            )
        );
        $context  = stream_context_create($options);
        $response = file_get_contents($url, false, $context);
        
        if ($response === false) {
            echo json_encode(array('success' => false, 'message' => 'Failed to reach Google Gemini API.'));
        } else {
            echo $response;
        }
        exit;
    }

    if ($action === 'publish_post') {
        $raw_data = json_decode(file_get_contents('php://input'), true);
        $secret_key = $raw_data['secret_key'] ?? '';
        
        // Secret key matching the token
        $expected_key = 'sp_b631cc98c293f9e988765e335acdb05e56f612e949a2c955dbb8f77b6ef6a527';
        if ($secret_key !== $expected_key) {
            echo json_encode(array('success' => false, 'message' => 'Unauthorized. Invalid secret key.'));
            exit;
        }
        
        if (!$is_wordpress) {
            echo json_encode(array('success' => true, 'message' => 'Local Standalone Mock: Post publish simulated successfully.'));
            exit;
        }
        
        // WordPress native post publishing
        $post_title = $raw_data['title'] ?? 'Bài viết mới từ AI';
        $post_content = $raw_data['content'] ?? '';
        $post_status = $raw_data['status'] ?? 'draft'; // 'draft' or 'publish'
        
        $post_id = wp_insert_post(array(
            'post_title'    => $post_title,
            'post_content'  => $post_content,
            'post_status'   => $post_status,
            'post_author'   => 1, // Default admin user
            'post_type'     => 'post'
        ));
        
        if (is_wp_error($post_id)) {
            echo json_encode(array('success' => false, 'message' => $post_id->get_error_message()));
        } else {
            // Handle optional image upload for featured image
            $image_base64 = $raw_data['image_base64'] ?? '';
            if (!empty($image_base64)) {
                if (preg_match('/^data:image\/(\w+);base64,/', $image_base64, $matches)) {
                    $image_base64 = substr($image_base64, strpos($image_base64, ',') + 1);
                }
                $image_data = base64_decode($image_base64);
                $upload_dir = wp_upload_dir();
                $filename = 'trivyna-ai-' . time() . '.jpg';
                $file_path = $upload_dir['path'] . '/' . $filename;
                
                file_put_contents($file_path, $image_data);
                
                $wp_filetype = wp_check_filetype($filename, null);
                $attachment = array(
                    'post_mime_type' => $wp_filetype['type'],
                    'post_title'     => sanitize_file_name($filename),
                    'post_content'   => '',
                    'post_status'    => 'inherit'
                );
                
                require_once(ABSPATH . 'wp-admin/includes/image.php');
                require_once(ABSPATH . 'wp-admin/includes/file.php');
                require_once(ABSPATH . 'wp-admin/includes/media.php');
                
                $attach_id = wp_insert_attachment($attachment, $file_path, $post_id);
                $attach_data = wp_generate_attachment_metadata($attach_id, $file_path);
                wp_update_attachment_metadata($attach_id, $attach_data);
                set_post_thumbnail($post_id, $attach_id);
            }
            
            echo json_encode(array('success' => true, 'post_id' => $post_id, 'message' => 'Post published successfully.'));
        }
        exit;
    }
}

// 4. WORDPRESS TABLE INSTALLATION HOOK (Only run if integrated)
if ($is_wordpress && isset($_GET['trivyna_install_db'])) {
    if (current_user_can('manage_options')) {
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        $charset_collate = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE $table_name (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            recorded_at datetime DEFAULT '0000-00-00 00:00:00' NOT NULL,
            gender varchar(10) NOT NULL,
            height double NOT NULL,
            weight double NOT NULL,
            bmi double NOT NULL,
            blood_pressure_systolic int(11) DEFAULT 0,
            blood_pressure_diastolic int(11) DEFAULT 0,
            blood_glucose double DEFAULT 0,
            liver_ast int(11) DEFAULT 0,
            liver_alt int(11) DEFAULT 0,
            kidney_creatinine double DEFAULT 0,
            kidney_urea double DEFAULT 0,
            cholesterol double DEFAULT 0,
            triglycerides double DEFAULT 0,
            uric_acid double DEFAULT 0,
            PRIMARY KEY  (id),
            KEY user_id (user_id)
        ) $charset_collate;";
        dbDelta($sql);
        echo "Database table installed successfully!";
        exit;
    }
}

// If running in standalone, render the HTML index placeholder or redirect
if (!$is_wordpress && !isset($_GET['action'])) {
    // Return standard layout if visited directly in local server testing
    include_once __DIR__ . '/index.html';
}
